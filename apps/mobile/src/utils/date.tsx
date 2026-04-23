/**
 * date.js - Tiện ích xử lý ngày tháng cho ứng dụng Mobile.
 * Đồng nhất dữ liệu giữa DD/MM/YYYY (API) và Date Object (UI).
 */

/**
 * Chuyển từ chuỗi (DD/MM/YYYY hoặc YYYY-MM-DD) sang Date object.
 * Trả về null nếu chuỗi không hợp lệ.
 */
export const stringToDate = (str: string | null | undefined) => {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (!s) return null;

  // Cắt chuỗi bằng bất kỳ ký tự không phải số nào (-, /, ., space)
  const parts = s.split(/[^0-9]+/);
  if (parts.length !== 3) return null;

  let day, month, year;

  // Kiểm tra nếu là YYYY-MM-DD (năm đứng đầu)
  if (parts[0].length === 4) {
    [year, month, day] = parts;
  } else {
    // Giả định là DD/MM/YYYY
    [day, month, year] = parts;
  }

  const d = parseInt(day, 10);
  const m = parseInt(month, 10) - 1; // Month trong JS là 0-11
  const y = parseInt(year, 10);

  const date = new Date(y, m, d);
  
  // Kiểm tra tính hợp lệ của ngày (ví dụ 31/02 sẽ bị nhảy sang 03/03)
  if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
    return date;
  }
  
  return null;
};

/**
 * Chuyển từ Date object sang chuỗi định dạng DD-MM-YYYY.
 */
export const dateToString = (date: Date | null | undefined) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  
  return `${d}-${m}-${y}`;
};

/**
 * Tách một chuỗi ngày thành các phần { day, month, year } dạng chuỗi.
 */
export const toDateParts = (str: string | null | undefined) => {
  const date = stringToDate(str);
  if (!date) return { day: '', month: '', year: '' };
  
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    year: String(date.getFullYear())
  };
};

/**
 * Format chuỗi DD-MM-YYYY (từ API) sang định dạng hiển thị cho người dùng.
 */
export const formatDisplayDate = (str: string | null | undefined) => {
  const parts = toDateParts(str);
  if (!parts.day) return 'Chưa cập nhật';
  return `${parts.day}-${parts.month}-${parts.year}`;
};
