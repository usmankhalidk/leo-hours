// src/services/NotificationService.ts
/**
 * Firebase Cloud Messaging (FCM) Service
 * Handles push notifications, token management, and backend communication
 */

import messaging from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';
import { StorageService } from './StorageService';
import { SnackbarService } from './SnackbarService';
import { NavigationService } from './NavigationService';
import axios from 'axios';
import config from '../config/app.config';

export interface NotificationPayload {
  title?: string;
  body?: string;
  data?: { [key: string]: string };
}

class NotificationServiceClass {
  private fcmToken: string | null = null;

  /**
   * Initialize notification service
   * Call this on app startup
   */
  async initialize(): Promise<void> {
    try {
      // Request permission
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        return;
      }

      // Get FCM token
      const token = await this.getFCMToken();
      if (token) {
        // Send token to backend
        await this.sendTokenToBackend(token);
      }

      // Setup notification handlers
      this.setupNotificationHandlers();

      // Handle token refresh
      this.handleTokenRefresh();

    } catch (error) {
      // Error initializing notifications
    }
  }

  /**
   * Request notification permission (Android 13+)
   */
  async requestPermission(): Promise<boolean> {
    try {
      if (Platform.OS === 'android') {
        if (Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Enable Notifications',
              message: 'leohours needs notification permission to send you important updates about your attendance.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
            }
          );

          const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
          return isGranted;
        }
        return true; // Older Android versions don't need runtime permission
      }

      // iOS
      const authStatus = await messaging().requestPermission();

      const isAuthorized = (
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL
      );

      return isAuthorized;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get FCM Token
   */
  async getFCMToken(): Promise<string | null> {
    try {
      // Check if already have token
      if (this.fcmToken) {
        return this.fcmToken;
      }

      // Get token from Firebase
      const token = await messaging().getToken();
      this.fcmToken = token;

      // Save to local storage
      await StorageService.saveFCMToken(token);

      return token;
    } catch (error) {
      return null;
    }
  }

  /**
   * Send FCM token to backend
   */
  async sendTokenToBackend(token: string): Promise<void> {
    try {
      const userToken = await StorageService.getAccessToken();
      if (!userToken) {
        return;
      }

      const API_URL = `${config.API.BASE_URL}/api/users/update-fcm-token`;

      const payload = {
        fcmToken: token,
      };

      const response = await axios.post(
        API_URL,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      if (!response.data.isSuccess) {
        // Backend response indicates failure
      }
    } catch (error: any) {
      // Don't show error to user - this is a background operation
    }
  }

  /**
   * Handle token refresh
   */
  handleTokenRefresh(): void {
    messaging().onTokenRefresh(async (newToken) => {
      this.fcmToken = newToken;
      await StorageService.saveFCMToken(newToken);
      await this.sendTokenToBackend(newToken);
    });
  }

  /**
   * Setup notification handlers
   */
  setupNotificationHandlers(): void {
    // Foreground notifications
    messaging().onMessage(async (remoteMessage) => {
      this.handleForegroundNotification(remoteMessage);
    });

    // Background & Quit state (handled in index.js)
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      // Background notification handled
    });

    // Notification opened (when user taps on notification)
    messaging().onNotificationOpenedApp((remoteMessage) => {
      this.handleNotificationOpen(remoteMessage);
    });

    // Check if app was opened from notification (killed state)
    messaging()
      .getInitialNotification()
      .then((remoteMessage) => {
        if (remoteMessage) {
          this.handleNotificationOpen(remoteMessage);
        }
      });
  }

  /**
   * Handle foreground notification
   * Show a snackbar or custom notification
   */
  handleForegroundNotification(remoteMessage: any): void {
    const { notification } = remoteMessage;

    if (notification) {
      const title = notification.title || 'New Notification';
      const body = notification.body || '';

      // Show snackbar
      SnackbarService.showInfo(`${title}: ${body}`);
    }
  }

  /**
   * Handle notification open
   * Navigate to relevant screen based on notification data
   */
  handleNotificationOpen(remoteMessage: any): void {
    // Navigate to Notifications screen for all notifications
    // This gives users a centralized place to view all their notifications
    try {
      NavigationService.navigate('Notifications');
    } catch (error) {
      // Error navigating to Notifications screen
    }
  }

  /**
   * Delete FCM token (on logout)
   */
  async deleteToken(): Promise<void> {
    try {
      await messaging().deleteToken();
      this.fcmToken = null;
      await StorageService.clearFCMToken();
    } catch (error) {
      // Error deleting FCM token
    }
  }

  /**
   * Get current token (if exists)
   */
  getCurrentToken(): string | null {
    return this.fcmToken;
  }
}

export const NotificationService = new NotificationServiceClass();
