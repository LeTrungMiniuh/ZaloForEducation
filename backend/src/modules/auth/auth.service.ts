import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { v4 as uuidv4 } from "uuid";
import * as bcrypt from "bcrypt";
import { DynamoDBService } from "../../infrastructure/dynamodb.service";
import { OtpService } from "../otp/otp.service";
import { OtpLimiterService } from "../otp/otp-limiter.service";
import { EmailService } from "../../infrastructure/email/email.service";
import { SessionService } from "./session.service";
import { ChatGateway } from "../chat/chat.gateway";
import {
  PutCommand,
  GetCommand,
  UpdateCommand,
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { RegisterRequestDto, LoginRequestDto, User } from "@zalo-edu/shared";
import { RedisService } from "../../infrastructure/redis.service";
import { validateDobStrict } from "../../infrastructure/utils/date.util";
import { DeviceService } from "./device.service";
import { ConfigService } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import { UserService } from "../user/user.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly db: DynamoDBService,
    private readonly sessionService: SessionService,
    private readonly deviceService: DeviceService,
    private readonly otpService: OtpService,
    private readonly otpLimiterService: OtpLimiterService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  private readonly googleClient = new OAuth2Client(
    this.configService.get("GOOGLE_CLIENT_ID") ||
      "1094444929007-avg6u84ak9i7n9ggnc543e1prb4otv9g.apps.googleusercontent.com",
  );

  private validatePassword(password: string) {
    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      throw new BadRequestException(
        "Mật khẩu phải tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.",
      );
    }
  }

  private validateRegistrationData(dto: RegisterRequestDto) {
    if (!dto.phone || !/^(0|84)(3|5|7|8|9)([0-9]{8})$/.test(dto.phone)) {
      throw new BadRequestException(
        "Số điện thoại không hợp lệ. Vui lòng nhập SĐT Việt Nam.",
      );
    }

    if (!dto.fullName || dto.fullName.trim().split(/\s+/).length < 2) {
      throw new BadRequestException("Họ tên phải bao gồm ít nhất 2 từ.");
    }

    if (/[0-9!@#$%^&*(),.?":{}|<>]/.test(dto.fullName)) {
      throw new BadRequestException(
        "Họ tên không được chứa số hoặc ký tự đặc biệt.",
      );
    }

    this.validatePassword(dto.password);
  }

  async requestRegisterOtp(email: string) {
    await this.otpLimiterService.checkCooldown(email, "register");
    const existingUser = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );

    if (existingUser.Item) {
      throw new BadRequestException("Email này đã được đăng ký.");
    }

    if (!email.endsWith("@gmail.com")) {
      throw new BadRequestException(
        "Chỉ chấp nhận đăng ký bằng tài khoản Gmail.",
      );
    }

    const code = await this.otpService.createOtp(email, "register");
    const emailSent = await this.emailService.sendOtp(email, code, "register");

    if (!emailSent) {
      throw new BadRequestException(
        "Không thể gửi mail lúc này. Vui lòng thử lại.",
      );
    }

    return { message: "Mã OTP đã được gửi về Gmail của bạn." };
  }

  async confirmRegister(dto: RegisterRequestDto) {
    this.validateRegistrationData(dto);
    await this.otpService.verifyOtp(dto.email, dto.otp);
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const newUser: User = {
      id: `USER#${dto.email}`,
      email: dto.email,
      fullName: dto.fullName || "",
      gender: dto.gender ?? true,
      dataOfBirth: validateDobStrict(dto.dataOfBirth),
      phone: dto.phone || "",
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(dto.fullName || "User")}&background=00418f&color=fff`,
      passwordHash,
      bio: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
      isActive: true,
      lastLoginAt: new Date().toISOString(),
    };

    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: newUser.id,
          SK: "METADATA",
          ...newUser,
        },
      }),
    );

    return { message: "Đăng ký tài khoản thành công!" };
  }

  async login(dto: LoginRequestDto) {
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${dto.email}`, SK: "METADATA" },
      }),
    );

    const user = result.Item as User;
    if (!user) {
      throw new UnauthorizedException("Email hoặc mật khẩu không chính xác.");
    }

    // Guard: Tài khoản đã bị xóa logic
    if (user.isDeleted) {
      throw new UnauthorizedException("Tài khoản này không tồn tại.");
    }

    // Guard: Tài khoản đã bị khóa
    if (user.status === "LOCKED") {
      throw new ForbiddenException(
        "Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.",
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    // RULE 3: Failed Login Attempts tracking
    const failKey = `login_fail:${dto.email}`;
    if (!isPasswordValid) {
      const fails = await this.redisService.incr(failKey);
      await this.redisService.expire(failKey, 3600); // 1 hour TTL

      const message =
        fails >= 3
          ? `Bạn đã nhập sai mật khẩu ${fails} lần. Vui lòng kiểm tra lại mật khẩu hoặc dùng tính năng Quên mật khẩu.`
          : "Email hoặc mật khẩu không chính xác.";

      throw new UnauthorizedException(message);
    }

    // 2. Identify platform: web or mobile
    const deviceId = dto.deviceId || `unknown-${Date.now()}`;
    const deviceType = dto.deviceType || "web";
    const platform =
      deviceType.toLowerCase() === "mobile" ||
      deviceType.toLowerCase() === "tablet"
        ? "mobile"
        : "web";
    const metadata = {
      deviceName: dto.deviceName || "Unknown Device",
      deviceType,
      platform,
    };

    let requireOtp = false;
    let otpReason = "";

    // 3. RULE 1: Device existence and trust status
    const deviceRecord = await this.deviceService.getDeviceStatus(
      user.email,
      deviceId,
    );
    if (!deviceRecord) {
      requireOtp = true;
      otpReason = "Thiết bị mới chưa từng đăng nhập.";
    } else if (deviceRecord.trusted === false) {
      requireOtp = true;
      otpReason = "Thiết bị này hiện chưa được tin cậy.";
    }

    // 4. RULE 2: Session Replaced (Force Logout)
    if (!requireOtp && deviceRecord?.lastLogoutReason === "SESSION_REPLACED") {
      requireOtp = true;
      otpReason = "Phiên làm việc trước đó đã bị thay thế bởi thiết bị khác.";
    }

    // 5. RULE 3: Failed Attempts (Wrong pass >= 3)
    const currentFails = parseInt(
      (await this.redisService.get(failKey)) || "0",
    );
    if (!requireOtp && currentFails >= 3) {
      requireOtp = true;
      otpReason =
        "Tài khoản có dấu hiệu bị xâm nhập (nhập sai mật khẩu nhiều lần).";
    }

    // 6. RULE 4: Inactive User (> 7 days since last login)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (
      !requireOtp &&
      deviceRecord?.lastLoginAt &&
      new Date(deviceRecord.lastLoginAt) < sevenDaysAgo
    ) {
      requireOtp = true;
      otpReason = "Đã quá 7 ngày kể từ lần đăng nhập cuối trên thiết bị này.";
    }

    // IF OTP REQUIRED: SEND AND RETURN
    if (requireOtp) {
      console.log(
        `🔥 [OTP_DEBUG] Rule triggered for ${dto.email}. Reason: ${otpReason}`,
      );
      const code = await this.otpService.createOtp(user.email, "login" as any);
      const emailSent = await this.emailService.sendOtp(
        user.email,
        code,
        "login" as any,
      );

      if (!emailSent) {
        console.error(`❌ [OTP_DEBUG] Failed to send email to ${user.email}`);
      }

      return {
        requireOtp: true,
        type: "REQUIRE_OTP",
        email: user.email,
        message: `Xác thực bảo mật: ${otpReason}`,
      };
    }

    // SUCCESSFUL LOGIN (No OTP needed)
    await this.redisService.del(failKey); // Reset failed attempts

    // 1. Quản lý phiên (Hybrid Single-Session V4) - Đá thiết bị cùng loại
    await this.deviceService.handleNewSession(user.email, deviceId, metadata);

    // 2. Tạo Session mới trong Redis
    await this.sessionService.createSession(user.email, deviceId, metadata);

    // 3. Metadata thiết bị chi tiết trong DynamoDB (Dùng PutCommand để ghi đè/tạo mới hoàn chỉnh)
    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: `USER#${user.email}`,
          SK: `DEVICE#${deviceId}`,
          email: user.email,
          deviceId,
          deviceName: dto.deviceName,
          deviceType: dto.deviceType,
          platform,
          status: "ACTIVE",
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    );

    this.chatGateway.notifySessionsUpdate(user.email);

    const payload = { sub: user.email, email: user.email, deviceId: deviceId };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        backgroundUrl: user.backgroundUrl || "",
        phone: user.phone,
        gender: user.gender,
        dataOfBirth: user.dataOfBirth,
        bio: user.bio,
      },
    };
  }

  async forgotPasswordRequestOtp(email: string) {
    await this.otpLimiterService.checkCooldown(email, "forgot_password");
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );

    if (!result.Item) {
      throw new BadRequestException(
        "Email này chưa được đăng ký trong hệ thống.",
      );
    }

    const code = await this.otpService.createOtp(email, "forgot_password");
    await this.emailService.sendOtp(email, code, "forgot_password");

    return {
      message:
        "Mã OTP đã được gửi về Gmail của bạn. Vui lòng kiểm tra hộp thư.",
    };
  }

  async forgotPasswordVerifyOtp(email: string, otp: string) {
    const savedCode = await this.otpService.getOtp(email);

    if (!savedCode || savedCode !== otp) {
      throw new BadRequestException("Mã OTP không chính xác hoặc đã hết hạn.");
    }

    return { message: "Xác thực OTP thành công. Vui lòng đặt mật khẩu mới." };
  }

  async resetPassword(email: string, otp: string, newPassword: string) {
    this.validatePassword(newPassword);
    await this.otpService.verifyOtp(email, otp);

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
        UpdateExpression: "SET passwordHash = :hash",
        ExpressionAttributeValues: {
          ":hash": passwordHash,
        },
      }),
    );

    this.chatGateway.notifySecurityAlert(email, {
      type: "PASSWORD_CHANGED",
      title: "Mật khẩu đã được thay đổi",
      message:
        "Hệ thống ghi nhận mật khẩu tài khoản vừa được thay đổi. Nếu không phải bạn, hãy khóa tài khoản ngay.",
    });

    return { message: "Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại." };
  }

  async verifyLoginOtp(
    email: string,
    otp: string,
    deviceId: string,
    deviceName?: string,
    deviceType?: string,
  ) {
    // 1. Xác thực OTP
    await this.otpService.verifyOtp(email, otp);

    // Snapshot trạng thái trust trước khi login thành công để phát hiện thiết bị lạ.
    const previousDeviceRecord = await this.deviceService.getDeviceStatus(
      email,
      deviceId,
    );
    const isNewOrUntrustedDevice =
      !previousDeviceRecord || previousDeviceRecord.trusted === false;

    // 2. Lấy thông tin User
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );
    const user = result.Item as User;
    if (!user) throw new BadRequestException("Người dùng không tồn tại.");

    // 3. Trust thiết bị
    await this.deviceService.trustDevice(email, deviceId);

    // 4. Reset counter đăng nhập sai
    await this.redisService.del(`login_fail:${email}`);

    // 5. Tạo phiên làm việc (Session)
    const platform =
      deviceType?.toLowerCase() === "mobile" ||
      deviceType?.toLowerCase() === "tablet"
        ? "mobile"
        : "web";
    const metadata = { deviceName, deviceType, platform };

    // Hybrid Single-Session V4 - Đá thiết bị cùng loại (Đã gia cố bằng DynamoDB)
    await this.deviceService.handleNewSession(email, deviceId, metadata);

    await this.sessionService.createSession(email, deviceId, metadata);

    // 6. Cập nhật DynamoDB (Metadata & Login At)
    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: `USER#${email}`,
          SK: `DEVICE#${deviceId}`,
          email,
          deviceId,
          deviceName: deviceName || "Unknown Device",
          deviceType: deviceType || "unknown",
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "ACTIVE",
          trusted: true,
          lastLogoutReason: null,
        },
      }),
    );

    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
        UpdateExpression: "SET currentDeviceId = :deviceId, lastLoginAt = :now",
        ExpressionAttributeValues: {
          ":deviceId": deviceId,
          ":now": new Date().toISOString(),
        },
      }),
    );

    this.chatGateway.notifySessionsUpdate(email);

    if (isNewOrUntrustedDevice) {
      this.chatGateway.notifySecurityAlert(email, {
        type: "NEW_DEVICE_LOGIN",
        title: "Phát hiện đăng nhập thiết bị lạ",
        message: `Tài khoản vừa đăng nhập trên thiết bị ${deviceName || "không xác định"}. Nếu không phải bạn, vui lòng đổi mật khẩu ngay.`,
        metadata: {
          deviceId,
          deviceName: deviceName || "Unknown Device",
          deviceType: deviceType || "unknown",
          platform,
        },
      });
    }

    // 7. Tạo Tokens
    const payload = { sub: email, email, deviceId };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        backgroundUrl: user.backgroundUrl || "",
        phone: user.phone,
        gender: user.gender,
        dataOfBirth: user.dataOfBirth,
        bio: user.bio,
      },
    };
  }

  async logout(email: string, deviceId: string) {
    const session = await this.sessionService.getSession(email, deviceId);

    await this.sessionService.removeSession(email, deviceId);

    await this.deviceService.markAsLoggedOut(email, deviceId, {
      deviceName: session?.deviceName,
      deviceType: session?.deviceType,
      reason: "USER_LOGOUT",
    });

    this.chatGateway.notifyForceLogout(
      email,
      deviceId,
      "Phiên đăng nhập đã kết thúc thành công.",
    );
    this.chatGateway.notifySessionsUpdate(email);
    return { message: "Đăng xuất thành công." };
  }

  async logoutAll(email: string) {
    // Outsource toàn bộ sang DeviceService để xử lý tập trung (Redis + DB + Socket)
    await this.deviceService.revokeAllSessions(email);
    return { message: "Đã đăng xuất khỏi tất cả các thiết bị." };
  }

  // ===== KHÓA TÀI KHOẢN =====

  async requestLockAccount(email: string, currentPassword: string) {
    // 1. Lấy user
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );
    const user = result.Item as User;
    if (!user) throw new BadRequestException("Người dùng không tồn tại.");

    // 2. Kiểm tra mật khẩu hiện tại
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException("Mật khẩu không chính xác.");
    }

    // 3. Giới hạn 30s giữa các lần gửi OTP
    await this.otpLimiterService.checkCooldown(email, "lock_account");

    // 4. Tạo và gửi OTP
    const code = await this.otpService.createOtp(email, "lock_account" as any);
    await this.emailService.sendOtp(email, code, "lock_account" as any);

    return {
      message: "Mã OTP xác nhận khóa tài khoản đã được gửi về email của bạn.",
    };
  }

  async confirmLockAccount(email: string, otp: string) {
    // 1. Xác thực OTP
    await this.otpService.verifyOtp(email, otp);

    // 2. Cập nhật trạng thái LOCKED trong DynamoDB
    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
        UpdateExpression:
          "SET #status = :status, isActive = :inactive, lockedAt = :now, updatedAt = :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "LOCKED",
          ":inactive": false,
          ":now": new Date().toISOString(),
        },
      }),
    );

    // 3. Vô hiệu hóa TẤT CẢ sessions (Web + Mobile) — Call DeviceService
    await this.deviceService.revokeAllSessions(email);

    return {
      message:
        "Tài khoản của bạn đã bị khóa thành công. Mọi phiên đăng nhập đã bị vô hiệu hoá.",
    };
  }

  // ===== XÓA TÀI KHOẢN =====

  async requestDeleteAccount(email: string, currentPassword: string) {
    // 1. Lấy user
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );
    const user = result.Item as User;
    if (!user) throw new BadRequestException("Người dùng không tồn tại.");

    // 2. Kiểm tra mật khẩu hiện tại
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException("Mật khẩu không chính xác.");
    }

    // 3. Giới hạn 30s giữa các lần gửi OTP
    await this.otpLimiterService.checkCooldown(email, "delete_account");

    // 4. Tạo và gửi OTP
    const code = await this.otpService.createOtp(
      email,
      "delete_account" as any,
    );
    await this.emailService.sendOtp(email, code, "delete_account" as any);

    return {
      message: "Mã OTP xác nhận xóa tài khoản đã được gửi về email của bạn.",
    };
  }

  async confirmDeleteAccount(email: string, otp: string) {
    // 1. Xác thực OTP
    await this.otpService.verifyOtp(email, otp);

    // 2. Chốt hạ: Dọn dẹp dữ liệu triệt để (Deep Cleanup)
    await this.cleanupUserData(email);

    return {
      message:
        "Tài khoản của bạn đã được xóa thành công. Cảm ơn bạn đã sử dụng dịch vụ.",
    };
  }

  async requestChangePassword(
    email: string,
    currentPassword: string,
    newPassword: string,
  ) {
    // 1. Lấy thông tin User
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );

    const user = result.Item as User;
    if (!user) throw new BadRequestException("Người dùng không tồn tại.");

    // 2. Kiểm tra mật khẩu hiện tại
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException("Mật khẩu hiện tại không chính xác.");
    }

    // 3. Kiểm tra mật khẩu mới
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        "Mật khẩu mới không được trùng với mật khẩu cũ.",
      );
    }
    this.validatePassword(newPassword);

    // 4. Hash mật khẩu mới và lưu vào Redis (TTL 5p giống OTP)
    const nextHash = await bcrypt.hash(newPassword, 12);
    await this.redisService.set(`CHANGE_PASS_PENDING#${email}`, nextHash, 300);

    // 5. Tạo OTP
    const code = await this.otpService.createOtp(email, "change_password");
    await this.emailService.sendOtp(email, code, "change_password");

    return { message: "Mã xác thực đã được gửi về email của bạn." };
  }

  async confirmChangePassword(email: string, otp: string) {
    // 1. Xác thực OTP
    await this.otpService.verifyOtp(email, otp);

    // 2. Lấy mật khẩu mới từ Redis
    const nextHash = await this.redisService.get(
      `CHANGE_PASS_PENDING#${email}`,
    );
    if (!nextHash) {
      throw new BadRequestException(
        "Yêu cầu đổi mật khẩu đã hết hạn. Vui lòng thực hiện lại.",
      );
    }

    // 3. Cập nhật DynamoDB
    await this.db.docClient.send(
      new UpdateCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
        UpdateExpression: "SET passwordHash = :hash, updatedAt = :now",
        ExpressionAttributeValues: {
          ":hash": nextHash,
          ":now": new Date().toISOString(),
        },
      }),
    );

    // 4. Cleanup Redis
    await this.redisService.del(`CHANGE_PASS_PENDING#${email}`);

    this.chatGateway.notifySecurityAlert(email, {
      type: "PASSWORD_CHANGED",
      title: "Mật khẩu đã được thay đổi",
      message:
        "Bạn vừa đổi mật khẩu thành công. Tất cả phiên đăng nhập sẽ được đăng xuất để bảo mật.",
    });

    // 5. Đăng xuất toàn bộ thiết bị (Supreme Security)
    await this.logoutAll(email);

    return {
      message:
        "Đổi mật khẩu thành công! Tất cả thiết bị đã được đăng xuất để bảo mật.",
    };
  }

  async getActiveSessions(email: string) {
    const deviceIds = await this.sessionService.getSessions(email);
    const sessions = [];

    for (const deviceId of deviceIds) {
      const session = await this.sessionService.getSession(email, deviceId);
      if (session) {
        sessions.push(session);
      } else {
        await this.sessionService.removeSession(email, deviceId);
      }
    }

    // 2. Lấy lịch sử đăng xuất từ DeviceService
    const loginHistory = await this.deviceService.getLoginHistory(email);

    const sorted = sessions.sort((a, b) => {
      const timeA = new Date(a.loginAt || a.lastActiveAt).getTime();
      const timeB = new Date(b.loginAt || b.lastActiveAt).getTime();
      return timeB - timeA;
    });

    return {
      activeDevices: sorted,
      loginHistory,
    };
  }

  async resendOtp(
    email: string,
    type: "register" | "forgot_password" | "login",
  ) {
    await this.otpLimiterService.checkCooldown(email, type);
    const code = await this.otpService.createOtp(email, type as any);
    await this.emailService.sendOtp(email, code, type as any);
    return { message: "Đã gửi lại mã OTP mới." };
  }

  async verifyOtpGeneric(email: string, otp: string) {
    await this.otpService.verifyOtp(email, otp);
    return { message: "Xác thực mã OTP thành công." };
  }

  async refreshToken(email: string, deviceId: string) {
    const session = await this.sessionService.getSession(email, deviceId);

    if (!session) {
      throw new UnauthorizedException("SESSION_INVALIDATED");
    }

    const payload = { sub: email, email, deviceId };
    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async testEmail(email: string) {
    await this.emailService.sendMail(
      email,
      "ZaloEdu - Test Email Configuration",
      "<h1>Cấu hình Email thành công!</h1><p>Bạn nhận được thư này tức là hệ thống SMTP đã hoạt động tốt.</p>",
    );
    return { message: "Đã gửi email test thành công." };
  }

  // ===== QR LOGIN LOGIC =====

  async generateQrCodeId() {
    const qrCodeId = uuidv4();
    const redisKey = `qr_login:${qrCodeId}`;
    await this.redisService.set(redisKey, "PENDING", 300); // 5 mins
    return { qrCodeId };
  }

  async confirmQrCode(
    email: string,
    qrCodeId: string,
    isBiometricVerified?: boolean,
  ) {
    const redisKey = `qr_login:${qrCodeId}`;
    const status = await this.redisService.get(redisKey);

    if (!status) {
      throw new BadRequestException("Mã QR đã hết hạn hoặc không tồn tại.");
    }

    if (status !== "PENDING") {
      throw new BadRequestException("Mã QR này đã được sử dụng.");
    }

    // AUTH LOG: Record if this login session was biometric-verified
    console.log(
      `[QR_LOGIN] User ${email} confirming session ${qrCodeId}. Biometric Verified: ${isBiometricVerified || false}`,
    );

    // 1. Lấy thông tin User
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );

    const user = result.Item as User;
    if (!user) {
      throw new BadRequestException("Người dùng không tồn tại.");
    }

    // 2. Tạo phiên làm việc Web mới
    const deviceId = `web-${uuidv4().split("-")[0]}`;
    const platform = "web";
    const metadata = {
      deviceName: "Web Browser (QR Login)",
      deviceType: "web",
      platform,
    };

    // 3. Tạo session mới TRƯỚC để web có token hợp lệ
    await this.sessionService.createSession(user.email, deviceId, metadata);

    // Sau đó mới kick session cũ cùng platform
    // Thứ tự này quan trọng: web phải nhận login_success trước force_logout
    const activeSessions = await this.sessionService.getSessions(email);
    for (const oldId of activeSessions) {
      if (oldId === deviceId) continue; // Bỏ qua session vừa tạo

      const oldSession = await this.sessionService.getSession(email, oldId);
      if (oldSession?.platform === "web") {
        console.log(`[QR] Kicking old web session: ${oldId}`);
        await this.sessionService.removeSession(email, oldId);
        // Delay 2s để web kịp nhận login_success và lưu token
        // trước khi nhận force_logout từ session cũ
        setTimeout(() => {
          this.chatGateway.notifyForceLogout(email, oldId);
        }, 2000);
      }
    }

    // 4. Lưu vào DynamoDB
    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: `USER#${user.email}`,
          SK: `DEVICE#${deviceId}`,
          email: user.email,
          deviceId,
          deviceName: metadata.deviceName,
          deviceType: metadata.deviceType,
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "ACTIVE",
        },
      }),
    );

    // 5. Tạo Tokens
    const payload = { sub: user.email, email: user.email, deviceId: deviceId };
    const tokens = {
      accessToken: this.jwtService.sign(payload),
      user: {
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        backgroundUrl: user.backgroundUrl || "",
        phone: user.phone,
      },
    };

    // 6. Thông báo cho Web qua Socket
    this.chatGateway.server.to(qrCodeId).emit("login_success", tokens);
    this.chatGateway.notifySessionsUpdate(email);

    // 7. Vô hiệu hóa mã QR ngay lập tức
    await this.redisService.del(redisKey);

    return { message: "Đăng nhập thành công trên trình duyệt." };
  }

  // ===== GOOGLE LOGIN LOGIC =====

  async googleLogin(
    idToken: string,
    deviceId: string,
    deviceName?: string,
    deviceType?: string,
  ) {
    try {
      const webClientId =
        this.configService.get("GOOGLE_CLIENT_ID") ||
        "1094444929007-avg6u84ak9i7n9ggnc543e1prb4otv9g.apps.googleusercontent.com";
      const iosClientId =
        this.configService.get("IOS_GOOGLE_CLIENT_ID") ||
        "1094444929007-94bne12jao91vd4rm1utet8aqn290f8d.apps.googleusercontent.com";

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: [webClientId, iosClientId],
      });
      const payload = ticket.getPayload();
      if (!payload) throw new BadRequestException("ID Token không hợp lệ.");

      const { email, name, picture, sub: googleId } = payload;

      // Đảm bảo có deviceId để tránh lỗi Redis (TypeError)
      const deviceIdToUse = deviceId || `google-${Date.now()}`;

      const result = await this.db.docClient.send(
        new GetCommand({
          TableName: this.db.tableName,
          Key: { PK: `USER#${email}`, SK: "METADATA" },
        }),
      );

      const existingUser = result.Item as User;

      if (existingUser) {
        // Chặn Google Login nếu tài khoản bị Xóa hoặc Khóa
        if (existingUser.isDeleted) {
          throw new UnauthorizedException("Tài khoản này không tồn tại.");
        }
        if (existingUser.status === "LOCKED") {
          throw new ForbiddenException(
            "Tài khoản của bạn hiện đang bị khóa. Vui lòng liên hệ quản trị viên.",
          );
        }

        // Cập nhật googleId (nếu chưa có) và lastLoginAt cho User cũ
        const shouldUpdateGoogleId = !existingUser.googleId;
        const updateExpr = [];
        const attrValues: any = { ":now": new Date().toISOString() };

        if (shouldUpdateGoogleId) {
          updateExpr.push("googleId = :gid");
          attrValues[":gid"] = googleId;
          existingUser.googleId = googleId;
        }

        updateExpr.push("lastLoginAt = :now");
        updateExpr.push("updatedAt = :now");

        await this.db.docClient.send(
          new UpdateCommand({
            TableName: this.db.tableName,
            Key: { PK: `USER#${email}`, SK: "METADATA" },
            UpdateExpression: `SET ${updateExpr.join(", ")}`,
            ExpressionAttributeValues: attrValues,
          }),
        );

        // Kiểm tra Smart Trusted Device
        const deviceRecord = await this.deviceService.getDeviceStatus(
          email,
          deviceIdToUse,
        );
        if (!deviceRecord || deviceRecord.trusted === false) {
          await this.otpLimiterService.checkCooldown(email, "login");
          const code = await this.otpService.createOtp(email, "login" as any);
          await this.emailService.sendOtp(email, code, "login" as any);
          return {
            requireOtp: true,
            type: "REQUIRE_OTP",
            email,
            message: "Thiết bị mới. Vui lòng xác thực mã OTP gửi về Email.",
          };
        }

        // Login thành công
        const platform =
          deviceType?.toLowerCase() === "mobile" ||
          deviceType?.toLowerCase() === "tablet"
            ? "mobile"
            : "web";
        const metadata = {
          deviceName,
          deviceType: deviceType || platform,
          platform,
        };

        // Hybrid Single-Session V4 - Đá thiết bị cùng loại
        await this.deviceService.handleNewSession(
          email,
          deviceIdToUse,
          metadata,
        );

        // Tạo Session mới trong Redis
        await this.sessionService.createSession(email, deviceIdToUse, metadata);

        // Lấy full profile từ UserService để đảm bảo trả về đủ field (address, phone, dob...)
        const { profile } = await this.userService.getUserProfile(email);

        const jwtPayload = { sub: email, email, deviceId: deviceIdToUse };
        return {
          accessToken: this.jwtService.sign(jwtPayload),
          user: profile,
        };
      }

      // User chưa tồn tại - Cache Google data và yêu cầu hoàn thiện Profile
      const pendingData = { email, name, picture, googleId };
      await this.redisService.set(
        `GOOGLE_PENDING#${email}`,
        JSON.stringify(pendingData),
        1800,
      ); // 30 mins

      // Bắt buộc tạo Session ngay cả cho User chưa hoàn thiện Profile để tránh lỗi SESSION_INVALIDATED
      const platform = deviceType === "web" ? "web" : "mobile";
      await this.sessionService.createSession(email, deviceIdToUse, {
        deviceName,
        deviceType,
        platform,
      });
      await this.deviceService.handleNewSession(email, deviceIdToUse, {
        deviceName,
        deviceType,
      });

      // Cấp token tạm thời với claim isPending
      const tempPayload = {
        sub: email,
        email,
        deviceId: deviceIdToUse,
        isPending: true,
      };
      const accessToken = this.jwtService.sign(tempPayload);

      return {
        isProfileComplete: false,
        email,
        name,
        picture,
        accessToken,
      };
    } catch (err) {
      console.error("Google login error:", err);
      throw new BadRequestException("Xác thực với Google thất bại.");
    }
  }

  async googleCompleteRequestOtp(email: string) {
    // Check pending Google data
    const pendingJson = await this.redisService.get(`GOOGLE_PENDING#${email}`);
    if (!pendingJson) {
      throw new BadRequestException(
        "Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại Google.",
      );
    }

    await this.otpLimiterService.checkCooldown(email, "google_complete");

    const code = await this.otpService.createOtp(email, "register");
    await this.emailService.sendOtp(email, code, "register");

    return { message: "Mã OTP đã được gửi về Gmail của bạn." };
  }

  async googleCompleteConfirm(
    dto: RegisterRequestDto & {
      deviceId: string;
      deviceName?: string;
      deviceType?: string;
    },
  ) {
    const {
      email,
      otp,
      password,
      fullName,
      gender,
      dataOfBirth,
      phone,
      deviceId,
      deviceName,
      deviceType,
    } = dto;

    // 1. Verify OTP
    await this.otpService.verifyOtp(email, otp);

    // 2. Lấy Google Data từ cache
    const pendingJson = await this.redisService.get(`GOOGLE_PENDING#${email}`);
    if (!pendingJson) {
      throw new BadRequestException(
        "Dữ liệu Google không tìm thấy hoặc đã hết hạn.",
      );
    }
    const googleData = JSON.parse(pendingJson);

    // 3. Validate dữ liệu bổ sung (Phone Regex defined here for server-side safety)
    if (!phone || !/^0[0-9]{9}$/.test(phone)) {
      throw new BadRequestException(
        "Số điện thoại không hợp lệ (phải bắt đầu bằng 0 và có 10 chữ số).",
      );
    }
    this.validatePassword(password);

    const passwordHash = await bcrypt.hash(password, 12);

    // 4. Upsert User vào DynamoDB
    const newUser: User = {
      id: `USER#${email}`,
      email,
      fullName: fullName || googleData.name || "",
      gender: gender ?? true,
      dataOfBirth: validateDobStrict(dataOfBirth),
      phone,
      avatarUrl:
        googleData.picture ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || "User")}&background=00418f&color=fff`,
      passwordHash,
      googleId: googleData.googleId,
      authProvider: "GOOGLE",
      bio: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
      isActive: true,
      isVerified: true,
      lastLoginAt: new Date().toISOString(),
    };

    await this.db.docClient.send(
      new PutCommand({
        TableName: this.db.tableName,
        Item: {
          PK: newUser.id,
          SK: "METADATA",
          ...newUser,
        },
      }),
    );

    // 5. Cleanup Cache
    await this.redisService.del(`GOOGLE_PENDING#${email}`);
    await this.redisService.del(`otp_limit:${email}`);

    // 6. Tạo Session và JWT (Handoff)
    const platform =
      deviceType?.toLowerCase() === "mobile" ||
      deviceType?.toLowerCase() === "tablet"
        ? "mobile"
        : "web";
    const metadata = { deviceName, deviceType, platform };

    // Hybrid Single-Session V4 - Đá thiết bị cùng loại
    await this.deviceService.handleNewSession(email, deviceId, metadata);

    await this.sessionService.createSession(email, deviceId, metadata);
    await this.deviceService.trustDevice(email, deviceId);

    const payload = { sub: email, email, deviceId };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        email: newUser.email,
        fullName: newUser.fullName,
        avatarUrl: newUser.avatarUrl,
        phone: newUser.phone,
        gender: newUser.gender,
        dataOfBirth: newUser.dataOfBirth,
      },
    };
  }

  // ===== LUỒNG XÓA TÀI KHOẢN KHI ĐANG BỊ KHÓA (LOCKED DELETION) =====

  async requestDeleteLockedAccount(email: string, currentPassword: string) {
    // 1. Lấy thông tin User
    const result = await this.db.docClient.send(
      new GetCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );
    const user = result.Item as User;
    if (!user) throw new BadRequestException("Tài khoản không tồn tại.");

    // 2. Kiểm tra mật khẩu (để đảm bảo chính chủ yêu cầu)
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException("Mật khẩu không chính xác.");
    }

    // 3. OTP Limiter
    await this.otpLimiterService.checkCooldown(email, "delete_account" as any);

    // 4. Gửi OTP (Dùng chung type delete_account)
    const code = await this.otpService.createOtp(
      email,
      "delete_account" as any,
    );
    await this.emailService.sendOtp(email, code, "delete_account" as any);

    return {
      message: "Mã OTP xác nhận xóa tài khoản đã được gửi về email của bạn.",
    };
  }

  async confirmDeleteLockedAccount(email: string, otp: string) {
    // 1. Xác thực OTP
    await this.otpService.verifyOtp(email, otp);

    // 2. Chốt hạ: Dọn dẹp dữ liệu triệt để
    await this.cleanupUserData(email);

    return { message: "Tài khoản của bạn đã được xóa vĩnh viễn thành công." };
  }

  // ===== CORE CLEANUP LOGIC (DEEP DELETION) =====

  private async cleanupUserData(email: string) {
    console.log(`[AUTH] Starting Deep Cleanup for ${email}`);

    // 1. Vô hiệu hóa sessions (Redis)
    await this.deviceService.revokeAllSessions(email);

    // 2. Truy quét toàn bộ bản ghi của người dùng (PK = USER#email)
    const result = await this.db.docClient.send(
      new QueryCommand({
        TableName: this.db.tableName,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": `USER#${email}` },
      }),
    );

    const items = result.Items || [];
    const deleteRequests = [];

    for (const item of items) {
      const sk = item.SK as string;

      // --- XỬ LÝ THEO LOẠI BẢN GHI ---

      // A. BẢN GHI BẠN BÈ (Reciprocal cleanup)
      if (sk.startsWith("FRIEND#")) {
        const friendEmail = sk.replace("FRIEND#", "");
        // Xóa bản ghi ở phía người bạn kia
        try {
          await this.db.docClient.send(
            new DeleteCommand({
              TableName: this.db.tableName,
              Key: { PK: `USER#${friendEmail}`, SK: `FRIEND#${email}` },
            }),
          );
        } catch (e) {
          console.warn(
            `[CLEANUP] Could not remove reciprocal friendship for ${friendEmail}`,
            e,
          );
        }
      }

      // B. BẢN GHI HỘI THOẠI (Group & Direct)
      if (sk.startsWith("CONV#")) {
        const convId = sk;
        // Lấy Metadata của hội thoại để sửa members
        try {
          const convRes = await this.db.docClient.send(
            new GetCommand({
              TableName: this.db.tableName,
              Key: { PK: convId, SK: "METADATA" },
            }),
          );
          const conv = convRes.Item;
          if (conv && conv.type === "group") {
            const newMembers = (conv.members || []).filter((m) => m !== email);
            await this.db.docClient.send(
              new UpdateCommand({
                TableName: this.db.tableName,
                Key: { PK: convId, SK: "METADATA" },
                UpdateExpression: "SET #members = :members, updatedAt = :now",
                ExpressionAttributeNames: { "#members": "members" },
                ExpressionAttributeValues: {
                  ":members": newMembers,
                  ":now": new Date().toISOString(),
                },
              }),
            );
          } else if (conv && conv.type === "direct") {
            // Xóa mapping mapping hội thoại ở phía người partner
            const partner = (conv.members || []).find((m) => m !== email);
            if (partner) {
              await this.db.docClient.send(
                new DeleteCommand({
                  TableName: this.db.tableName,
                  Key: { PK: `USER#${partner}`, SK: convId },
                }),
              );
            }
          }
        } catch (e) {
          console.warn(`[CLEANUP] Could not cleanup conversation ${convId}`, e);
        }
      }

      // CHUẨN BỊ XÓA (Trừ METADATA - để làm "tombstone")
      if (sk !== "METADATA") {
        deleteRequests.push({
          DeleteRequest: { Key: { PK: `USER#${email}`, SK: sk } },
        });
      }
    }

    // 3. Thực hiện xóa Batch (tối đa 25 items/request trong DynamoDB BatchWrite)
    while (deleteRequests.length > 0) {
      const chunk = deleteRequests.splice(0, 25);
      await this.db.docClient.send(
        new BatchWriteCommand({
          RequestItems: { [this.db.tableName]: chunk },
        }),
      );
    }

    // 4. RESET METADATA - Chuyển sang XÓA CỨNG (Hard Delete) theo yêu cầu
    await this.db.docClient.send(
      new DeleteCommand({
        TableName: this.db.tableName,
        Key: { PK: `USER#${email}`, SK: "METADATA" },
      }),
    );

    console.log(`[AUTH] Deep Cleanup completed for ${email}`);
  }
}
