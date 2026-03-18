import axios from 'axios';
import { Platform } from 'react-native';
import config from '../config/app.config';
import { StorageService } from '../services/StorageService';
import { NavigationService } from '../services/NavigationService';
import { SnackbarService } from '../services/SnackbarService';
import { CreateLeavePayload, LeaveRequest as LeaveRequestType } from '../types';

/**
 * Attendance API
 * 
 * This file handles attendance, leave, and profile-related API calls.
 * 
 * NOTE: For notification-related APIs, use /src/api/notifications.ts
 */

// Response type for API calls
export interface ApiResponse {
  isSuccess: boolean;
  message: string;
  data?: any;
  fileUrl?: string; // For file upload responses
}

// 1. Prepare the Base URL securely
const API_DOMAIN = config.API.BASE_URL.replace(/\/$/, '');
const ATTENDANCE_PATH = '/api/attendance';

const BASE_URL = `${API_DOMAIN}${ATTENDANCE_PATH}`;

// 2. Create Axios Instances
// For attendance specific calls
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// For generic API calls (users, leave-management, etc.)
const rootApiClient = axios.create({
  baseURL: `${API_DOMAIN}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Helper to add auth interceptor to an instance
const addAuthInterceptor = (instance: any) => {
  instance.interceptors.request.use(
    async (config: any) => {
      try {
        const token = await StorageService.getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {}
      return config;
    },
    (error: any) => Promise.reject(error)
  );
};

addAuthInterceptor(apiClient);
addAuthInterceptor(rootApiClient);

// 2.6. Add Response Interceptor for Network Error Handling
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    // Handle network errors
    if (!error.response) {
      // Network error (no response received)
      throw new Error('Please check your internet connection and try again.');
    }

    // Handle HTTP errors
    if (error.response.status >= 500) {
      throw new Error('Server is temporarily unavailable. Please try again later.');
    }

    // Handle authentication errors - Token Expired
    if (error.response.status === 401) {
      await StorageService.clearAllData();
      NavigationService.setAuthenticated(false);
      NavigationService.reset([{ name: 'LoginScreen' }]);
      SnackbarService.showError('Session expired. Please login again.');
    }

    return Promise.reject(error);
  }
);

// 3. Payload Interfaces
export interface CreateAttendancePayload {
  ipAddress?: string;
}

export interface EmployeeSchedule {
  _id: string;
  scheduleName: string;
  timeIn: string;
  timeOut: string;
  timeInFlexibility: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export interface EmployeeDetails {
  _id: string;
  fullName: string;
  guardianName: string;
  contactNumber: string;
  officialEmail: string;
  personalEmail: string;
  empCode: string;
  emergencyContactNumber: string;
  position: string;
  profilePhotoUrl?: string;
  bankAccount: string;
  scheduleId: EmployeeSchedule;
  address: string;
  role: string;
  isActive: boolean;
  customSchedule: any[];
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export interface GetLeavesResponse extends ApiResponse {
  data: {
    leaves: LeaveRequestType[];
    total: number;
  };
}

export interface Notification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type?: 'leave_approved' | 'leave_rejected' | 'leave_pending' | 'announcement' | 'reminder' | 'general';
  isRead: boolean;
  createdAt: string;
  updatedAt?: string;
  data?: any; // Additional data like leave details
}

// Removed GetNotificationsResponse - Use notifications.ts API instead

export interface AttendanceReportParams {
  year: number;
  month: number;
  count?: number;
  pageNo?: number;
}

export interface AttendanceReportResponse extends ApiResponse {
  data: Array<{
    _id: string;
    fullName: string;
    officialEmail: string;
    position: string;
    attendance: Array<{
      _id: string;
      empId: string;
      reason: string;
      status: 'present' | 'late' | 'absent';
      timeIn: string;
      empDocId: string;
      createdAt: string;
      updatedAt?: string;
      __v?: number;
    }>;
  }>;
  totalCount: number;
}

export interface DashboardStateParams {
  from: string;
  to: string;
}

export interface DashboardStateItem {
  name: string;
  value: number;
  percentage: string;
}

export interface DashboardStateResponse extends ApiResponse {
  data: DashboardStateItem[];
}

export interface RecentAttendanceResponse extends ApiResponse {
  data: Array<{
    date: string;
    timeIn: string;
    timeOut: string;
    status: string;
    workingHours: string;
    breakMins: number;
  }>;
}

export interface EmployeeReportParams {
  year: number;
  month: number;
  empDocId: string;
  count?: number;
  pageNo?: number;
}

export interface EmployeeReportResponse extends ApiResponse {
  data: Array<{
    _id: string;
    fullName: string;
    officialEmail: string;
    position: string;
    attendance: Array<{
      _id: string;
      empId?: string;
      reason?: string;
      status?: 'present' | 'late' | 'absent';
      timeIn?: string;
      timeOut?: string;
      empDocId: string;
      createdAt: string;
      updatedAt?: string;
      __v?: number;
    }>;
  }>;
  totalCount: number;
}

export interface TodayAttendanceStatus {
  attendanceId: string | null;
  timeIn: string | null;
  timeOut: string | null;
  status: string;
  isBreakActive: boolean;
  previousDay: any;
  isAllowToMark: boolean;
  message: string;
}

export interface TodayAttendanceStatusResponse extends ApiResponse {
  data: TodayAttendanceStatus;
}

export interface CheckStatusResponse extends ApiResponse {
  data: {
    hasTimedIn: boolean;
    hasTimedOut: boolean;
    action: 'timeIn' | 'timeOut';
    message: string;
  };
}

export interface BreakTogglePayload {
  attendanceId: string;
  reason: string;
}

export interface BreakToggleResponse extends ApiResponse {
  data: {
    attendanceId: string;
    startTime?: string;
    endTime?: string;
    duration: number;
    reason: string;
    _id: string;
    createdAt: string;
    updatedAt: string;
  };
}

export const AttendanceAPI = {
  checkStatus: async (): Promise<CheckStatusResponse> => {
    try {
      const res = await apiClient.get('/checkStatus');
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },

  create: async (payload: CreateAttendancePayload): Promise<ApiResponse> => {
    try {
      // Use apiClient instead of raw axios
      const res = await apiClient.post('/mark-attendance', payload);
      return res.data;
    } catch (error: any) {
      throw error; // Throw it back to the screen to handle
    }
  },

  report: async (params: AttendanceReportParams): Promise<AttendanceReportResponse> => {
    try {
      // Use apiClient with query parameters
      const res = await apiClient.get('/report', { params });
      return res.data;
    } catch (error: any) {
      throw error; // Throw it back to the screen to handle
    }
  },

  dashboardState: async (params: DashboardStateParams): Promise<DashboardStateResponse> => {
    try {
      const res = await apiClient.get('/getMyDashboardState', { params });
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },

  recentAttendance: async (): Promise<RecentAttendanceResponse> => {
    try {
      const res = await apiClient.get('/my-recent-attendance');
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },

  reportsByEmployee: async (params: EmployeeReportParams): Promise<EmployeeReportResponse> => {
    const { empDocId, ...queryParams } = params;
    const endpoint = `/reportsByEmployId/${empDocId}`;

    try {
      const res = await apiClient.get(endpoint, { params: queryParams });
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },  uploadProfilePic: async (imageAsset: any): Promise<ApiResponse> => {
    // New unified upload path
    const url = `${API_DOMAIN}/api/upload`;

    try {
      const token = await StorageService.getAccessToken();

      // 1. Create FormData
      const formData = new FormData();

      // 2. Append the file
      formData.append('file', {
        uri: Platform.OS === 'android'
          ? imageAsset.uri
          : imageAsset.uri.replace('file://', ''),
        type: imageAsset.type || 'image/jpeg',
        name: imageAsset.fileName || `profile_${Date.now()}.jpg`,
      } as any);

      // 3. Send Request
      const response = await axios.post(url, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        transformRequest: (data) => data,
        timeout: 30000,
      });

      // Map new response structure (data.url) to fileUrl for ProfileScreen compatibility
      const result = response.data;
      if (result.isSuccess && result.data?.url) {
        // Force HTTPS if it's currently HTTP to avoid ATS/Cleartext blocks
        result.fileUrl = result.data.url.replace(/^http:\/\//i, 'https://');
      }

      return result;
    } catch (error: any) {
      throw error;
    }
  },

  createLeave: async (payload: CreateLeavePayload): Promise<ApiResponse> => {
    try {
      const res = await rootApiClient.post('/leave-management/create-my-leave', payload);

      return {
        isSuccess: true,
        message: res.data?.message || 'Leave request submitted successfully',
        data: res.data?.data || res.data,
      };
    } catch (error: any) {
      return {
        isSuccess: false,
        message: error.response?.data?.message || error.message || 'Failed to create leave request',
        data: error.response?.data,
      };
    }
  },

  getLeaves: async (params?: { status?: string; pageNo?: number; count?: number }): Promise<GetLeavesResponse> => {
    try {
      const res = await apiClient.get('/leave-management/getLeaves', { params });

      return {
        isSuccess: true,
        message: 'Leaves fetched successfully',
        data: {
          leaves: res.data?.data?.leaves || res.data?.leaves || [],
          total: res.data?.data?.total || res.data?.total || 0,
        },
      };
    } catch (error: any) {
      return {
        isSuccess: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch leave requests',
        data: {
          leaves: [],
          total: 0,
        },
      };
    }
  },

  getAllLeavesByUserId: async (userId: string): Promise<GetLeavesResponse> => {
    try {
      const res = await apiClient.get('/leave-management/getMyLeaves');

      // Handle the actual response format: data is an array directly
      const leaves = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
          ? res.data
          : [];

      const total = leaves.length;

      return {
        isSuccess: res.data?.isSuccess !== false, // Default to true if not specified
        message: res.data?.message || 'Leaves fetched successfully',
        data: {
          leaves: leaves,
          total: total,
        },
      };
    } catch (error: any) {
      return {
        isSuccess: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch leave requests',
        data: {
          leaves: [],
          total: 0,
        },
      };
    }
  },

  // Alternative upload function using fetch (if axios fails)
  uploadProfilePicFetch: async (imageAsset: any): Promise<ApiResponse> => {
    const url = `${API_DOMAIN}/api/upload`;

    try {
      const token = await StorageService.getAccessToken();

      const formData = new FormData();
      formData.append('file', {
        uri: imageAsset.uri,
        type: imageAsset.type || 'image/jpeg',
        name: imageAsset.fileName || 'upload.jpg',
      } as any);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(JSON.stringify(json));
      }

      // Map new response structure (data.url) to fileUrl
      if (json.isSuccess && json.data?.url) {
        // Force HTTPS
        json.fileUrl = json.data.url.replace(/^http:\/\//i, 'https://');
      }

      return json;
    } catch (error: any) {
      throw error;
    }
  },

  getAllTeamleads: async (): Promise<any> => {
    try {
      const res = await rootApiClient.get('/users/getAllTeamleads');
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },

  getMyAllLeaves: async (): Promise<any> => {
    try {
      const res = await rootApiClient.get('/leave-management/get-My-all-leaves');
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },

  deleteLeave: async (leaveId: string): Promise<ApiResponse> => {
    try {
      const res = await rootApiClient.delete(`/leave-management/delete-leave/${leaveId}`);
      return {
        isSuccess: true,
        message: res.data?.message || 'Leave record deleted successfully',
        data: res.data,
      };
    } catch (error: any) {
      return {
        isSuccess: false,
        message: error.response?.data?.message || error.message || 'Failed to delete leave record',
        data: error.response?.data,
      };
    }
  },

  getMyStatus: async (): Promise<TodayAttendanceStatusResponse> => {
    try {
      const res = await apiClient.get('/getMyStatus');
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },

  toggleBreak: async (payload: BreakTogglePayload): Promise<BreakToggleResponse> => {
    try {
      const res = await rootApiClient.post('/attendance-breaks/break-toggle', payload);
      return res.data;
    } catch (error: any) {
      throw error;
    }
  },
};

export default AttendanceAPI;