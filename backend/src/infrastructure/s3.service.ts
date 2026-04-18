import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private readonly logger = new Logger(S3Service.name);

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get<string>('AWS_REGION') || 'ap-southeast-1',
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
      },
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'avatars'): Promise<string> {
    const bucketName = this.configService.get<string>('S3_BUCKET_NAME');
    const region = this.configService.get<string>('AWS_REGION') || 'ap-southeast-1';
    
    if (!bucketName) {
      this.logger.error('S3_BUCKET_NAME is not defined in environment variables');
      throw new Error('Cấu hình lưu trữ (S3) chưa hoàn tất.');
    }

    const key = `${folder}/${uuidv4()}-${file.originalname}`;
    
    this.logger.log(`Starting upload to S3: bucket=${bucketName}, key=${key}, size=${file.buffer?.length}`);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
      this.logger.log(`Upload successful: ${url}`);
      return url;
    } catch (error) {
      this.logger.error(`S3 upload failed for key ${key}: ${error.message}`, error.stack);
      throw new Error(`Lỗi khi tải ảnh lên S3: ${error.message}`);
    }
  }

  async deleteFile(fileUrl: string): Promise<void> {
    const bucketName = this.configService.get<string>('S3_BUCKET_NAME');
    if (!bucketName || !fileUrl) return;

    try {
      // Extract key from URL: https://bucket.s3.region.amazonaws.com/folder/filename
      const urlParts = fileUrl.split('.amazonaws.com/');
      if (urlParts.length < 2) return;
      
      const key = decodeURIComponent(urlParts[1]);

      this.logger.log(`Deleting file from S3: bucket=${bucketName}, key=${key}`);

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucketName,
          Key: key,
        })
      );
      this.logger.log(`Successfully deleted file from S3: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete S3 file ${fileUrl}: ${error.message}`);
    }
  }
}
