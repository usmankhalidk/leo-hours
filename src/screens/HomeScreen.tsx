// src/screens/HomeScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Animated,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import LinearGradient from 'react-native-linear-gradient';
import FastImage from 'react-native-fast-image';
import {
  Bell, Clock, Coffee, LogOut, Fingerprint, Briefcase,
  CheckCircle, AlertCircle, Timer, User, ArrowRight
} from 'lucide-react-native';

import { AttendanceService } from '../services/AttendanceService';
import { SnackbarService } from '../services/SnackbarService';
import { StorageService, UserData } from '../services/StorageService';
import { NavigationService } from '../services/NavigationService';
import { IpService } from '../services/IpService';
import { NotificationService } from '../services/NotificationService';
import { NotificationsAPI } from '../api/notifications';
import { AttendanceAPI } from '../api/attendance';
import ConfirmLogoutModal from '../components/ConfirmLogoutModal';
import ImagePreviewModal from '../components/ImagePreviewModal';
import { ProfileImageService } from '../services/ProfileImageService';
import { ErrorHandler } from '../utils/errorHandler';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<'Check' | 'Break' | 'Leave'>('Check');
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkInTime, setCheckInTime] = useState('--:--');
  const [workedTime, setWorkedTime] = useState('0h 0m');
  const [checkInTimestamp, setCheckInTimestamp] = useState<Date | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [biometricsAvailable, setBiometricsAvailable] = useState<boolean | null>(null);
  const [employeeStats, setEmployeeStats] = useState<{
    onTimeDays: number;
    lateDays: number;
    onLeaveDays: number;
    absentDays: number;
  } | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [showBreakReasonModal, setShowBreakReasonModal] = useState(false);
  const [breakReason, setBreakReason] = useState('');
  const [breakLoading, setBreakLoading] = useState(false);
  const [attendanceId, setAttendanceId] = useState<string | null>(null);
  const [isBreakActive, setIsBreakActive] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [attendanceMessage, setAttendanceMessage] = useState<string | null>(null);
  const [attendanceStatus, setAttendanceStatus] = useState<string | null>(null);
  const [isAllowToMark, setIsAllowToMark] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const profileSlide = useRef(new Animated.Value(-50)).current;
  const cardSlide = useRef(new Animated.Value(50)).current;
  const statsSlide = useRef(new Animated.Value(50)).current;

  // Entrance animations
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(profileSlide, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(cardSlide, {
        toValue: 0,
        duration: 700,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(statsSlide, {
        toValue: 0,
        duration: 700,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Pulsing animation for check-in button
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, []);

  useEffect(() => {
    loadUserData();
    loadAttendanceSession();
    syncAttendanceStatus();
    checkBiometricsAvailability();
    loadDashboardState();

    // Listen for profile image updates
    const unsubscribe = ProfileImageService.onProfileImageUpdate((newImageUrl) => {
      setImageError(false); // Reset error state on update
      setUserData((prevUserData) => {
        if (prevUserData) {
          return { ...prevUserData, profilePhotoUrl: newImageUrl };
        }
        return prevUserData;
      });
    });

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
  }, []);

  // Load notification count when userData is available
  useEffect(() => {
    if (userData?._id) {
      loadNotificationCount();
    }
  }, [userData?._id]);

  // Refresh notification count when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (userData?._id) {
        loadNotificationCount();
        syncAttendanceStatus(); // Also sync attendance status on focus
      }
    }, [userData?._id])
  );

  // Real-time working time update with proper cleanup
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (isCheckedIn && checkInTimestamp) {
      // Update immediately first
      const updateWorkedTime = () => {
        const now = new Date();
        const diffMs = Math.max(0, now.getTime() - checkInTimestamp.getTime());
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setWorkedTime(`${hours}h ${minutes}m`);
      };

      updateWorkedTime(); // Update immediately

      // Then update every 30 seconds for better responsiveness
      intervalId = setInterval(updateWorkedTime, 30000);
    }

    // Cleanup interval on unmount or when check-in state changes
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isCheckedIn, checkInTimestamp]);

  const checkBiometricsAvailability = async () => {
    try {
      const { available } = await AttendanceService.checkAvailability();
      setBiometricsAvailable(available);
    } catch (error) {
      setBiometricsAvailable(false);
    }
  };

  const loadUserData = async () => {
    try {
      const data = await StorageService.getUserData();
      setUserData(data);
    } catch (error) {
      ErrorHandler.logError(error, 'HomeScreen - loadUserData');
    }
  };

  const loadNotificationCount = async () => {
    try {
      const userId = userData?._id;
      if (!userId) {
        return;
      }

      const response = await NotificationsAPI.getUnreadCount(userId);

      if (response.isSuccess && response.data) {
        const count = response.data.count || 0;
        setUnreadNotificationCount(count);
      } else {
        setUnreadNotificationCount(0);
      }
    } catch (error) {
      setUnreadNotificationCount(0); // Reset to 0 on error
    }
  };

  const loadAttendanceSession = async () => {
    try {
      const session = await StorageService.getAttendanceSession();
      if (session) {
        setIsCheckedIn(session.isCheckedIn);
        setCheckInTime(session.checkInTime);
        setCheckInTimestamp(session.checkInTimestamp ? new Date(session.checkInTimestamp) : null);
        setWorkedTime(session.workedTime);
      }
    } catch (error) {
      ErrorHandler.logError(error, 'HomeScreen - loadAttendanceSession');
    }
  };

  const loadDashboardState = async () => {
    try {
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const formatLocalDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const response = await AttendanceAPI.dashboardState({
        from: formatLocalDate(firstDayOfMonth),
        to: formatLocalDate(lastDayOfMonth),
      });

      if (response.isSuccess && response.data) {
        const getVal = (name: string) => response.data.find(i => i.name === name)?.value || 0;
        setEmployeeStats({
          onTimeDays: getVal('On Time'),
          lateDays: getVal('Late'),
          onLeaveDays: getVal('Leave'),
          absentDays: getVal('Absent'),
        });
      }
    } catch (error) {
      ErrorHandler.logError(error, 'HomeScreen - loadDashboardState');
    }
  };

  const syncAttendanceStatus = async () => {
    try {
      setSyncLoading(true);
      const response = await AttendanceAPI.getMyStatus();

      if (response.isSuccess && response.data) {
        const {
          attendanceId: currentAttendanceId,
          timeIn,
          timeOut,
          message,
          status,
          isAllowToMark: allowMark,
          isBreakActive: breakActive,
        } = response.data;
        
        setAttendanceMessage(message);
        setAttendanceStatus(status);
        setIsAllowToMark(allowMark !== false); // Default to true if missing
        setAttendanceId(currentAttendanceId || null);
        setIsBreakActive(!!breakActive);

        // Sync the UI state with backend status
        const isCurrentlyCheckedIn = !!(timeIn && !timeOut);
        setIsCheckedIn(isCurrentlyCheckedIn);

        if (timeIn) {
          const checkInDate = new Date(timeIn);
          const formattedTime = checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setCheckInTime(formattedTime);
          setCheckInTimestamp(checkInDate);

          // Update session if it's different or missing
          const session = await StorageService.getAttendanceSession();
          if (!session || session.isCheckedIn !== isCurrentlyCheckedIn || session.checkInTime !== formattedTime) {
            await StorageService.saveAttendanceSession({
              isCheckedIn: isCurrentlyCheckedIn,
              checkInTime: formattedTime,
              checkInTimestamp: timeIn,
              workedTime: workedTime
            });
          }
        } else {
          setCheckInTime('--:--');
          setCheckInTimestamp(null);
          setWorkedTime('0h 0m');
          
          const session = await StorageService.getAttendanceSession();
          if (session?.isCheckedIn) {
             await StorageService.saveAttendanceSession({
              isCheckedIn: false,
              checkInTime: '--:--',
              checkInTimestamp: null,
              workedTime: '0h 0m'
            });
          }
        }
      }
    } catch (error) {
      ErrorHandler.logError(error, 'HomeScreen - syncAttendanceStatus');
    } finally {
      setSyncLoading(false);
    }
  };



  const handleTabPress = (tab: 'Check' | 'Leave') => {
    if (tab === 'Leave') {
      NavigationService.navigate('LeaveRequest');
      return;
    }
    setActiveTab(tab);
  };

  const handleAttendancePress = async () => {
    // Prevent double-taps
    if (loading) return;
    
    // Directly process attendance without reason modal
    processAttendance();
  };

  const handleBreakToggleRequest = async (reason: string) => {
    let targetAttendanceId = attendanceId;

    if (!targetAttendanceId) {
      const latestStatus = await AttendanceAPI.getMyStatus();
      if (latestStatus.isSuccess && latestStatus.data?.attendanceId) {
        targetAttendanceId = latestStatus.data.attendanceId;
        setAttendanceId(targetAttendanceId);
      }
    }

    if (!targetAttendanceId) {
      SnackbarService.showError('Attendance session not found. Please check in first.');
      return;
    }

    setBreakLoading(true);
    try {
      const response = await AttendanceAPI.toggleBreak({
        attendanceId: targetAttendanceId,
        reason,
      });

      if (response.isSuccess) {
        SnackbarService.showSuccess(response.message || (isBreakActive ? 'Break ended successfully' : 'Break started successfully'));
        setShowBreakReasonModal(false);
        setBreakReason('');
        await syncAttendanceStatus();
      } else {
        SnackbarService.showError(response.message || 'Failed to update break status');
      }
    } catch (error: any) {
      ErrorHandler.showError(error);
    } finally {
      setBreakLoading(false);
    }
  };

  const handleBreakTogglePress = () => {
    if (!isCheckedIn) {
      SnackbarService.showError('Please check in first to use break.');
      return;
    }

    if (isBreakActive) {
      handleBreakToggleRequest('');
      return;
    }

    setShowBreakReasonModal(true);
  };

  const handleBreakStartConfirm = () => {
    const trimmedReason = breakReason.trim();
    if (!trimmedReason) {
      SnackbarService.showError('Please enter break reason');
      return;
    }

    handleBreakToggleRequest(trimmedReason);
  };

  const processAttendance = async () => {
    // 1. Biometric Authentication (if available)
    if (biometricsAvailable) {
      // NOTE: We already checked availability in useEffect, so we skip checkAvailability here for speed.
      const isAuthenticated = await AttendanceService.authenticateUser();
      if (!isAuthenticated) {
        SnackbarService.showError("Biometric authentication failed");
        return;
      }
    }
    // 1. Show Loading state immediately
    setLoading(true);

    try {
      // Fetch Real IP Address
      let ipAddress = '';
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        if (ipData && ipData.ip) {
          ipAddress = ipData.ip;
        }
      } catch (err) {
        // Fallback silently if IP fetch fails
      }

      // Use cached userData from state if available to save time
      const user = userData || await StorageService.getUserData();

      if (!user) {
        throw new Error('User data not found');
      }

      const payload = {
        ipAddress,
      };

      const response = await AttendanceAPI.create(payload);

      if (response.isSuccess) {
        // Success! Update UI
        const now = new Date();
        const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (!isCheckedIn) {
          // Was checking in
          setIsCheckedIn(true);
          setCheckInTime(formattedTime);
          setCheckInTimestamp(now);
          setWorkedTime('0h 0m');
          
          await StorageService.saveAttendanceSession({
            isCheckedIn: true,
            checkInTime: formattedTime,
            checkInTimestamp: now.toISOString(),
            workedTime: '0h 0m'
          });
          SnackbarService.showSuccess("Checked In Successfully!");
        } else {
          // Was checking out
          setIsCheckedIn(false);
          setCheckInTime('--:--');
          setCheckInTimestamp(null);
          
          await StorageService.saveAttendanceSession({
            isCheckedIn: false,
            checkInTime: '--:--',
            checkInTimestamp: null,
            workedTime: '0h 0m'
          });
          SnackbarService.showSuccess("Checked Out Successfully!");
        }
        // Refresh status to get updated messages/tags from backend
        syncAttendanceStatus();
      } else {
        throw new Error(response.message || "Failed to mark attendance");
      }

    } catch (error: any) {
      ErrorHandler.showError(error);
    } finally {
      setLoading(false);
    }
  };



  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <LinearGradient colors={['#E8ECFF', '#F5F7FF', '#FFFFFF']} style={StyleSheet.absoluteFill} />
      <View style={styles.blob} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Animated Header */}
        <Animated.View style={[
          styles.header,
          {
            opacity: fadeAnim,
            transform: [{ translateY: profileSlide }],
          }
        ]}>
          <View style={styles.userInfo}>

            <TouchableOpacity
              onPress={() => userData?.profilePhotoUrl && setShowImagePreview(true)}
              activeOpacity={userData?.profilePhotoUrl ? 0.7 : 1}
            >
              {userData?.profilePhotoUrl && !imageError ? (
                <FastImage
                  source={{
                    uri: userData.profilePhotoUrl,
                    priority: FastImage.priority.high,
                  }}
                  style={styles.avatar}
                  resizeMode={FastImage.resizeMode.cover}
                  onError={() => setImageError(true)}
                />
              ) : (
                <View style={styles.defaultAvatar}>
                  <User size={28} color="#94A3B8" strokeWidth={1.5} />
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.textContainer}>
              <Text style={styles.dateText} numberOfLines={1}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</Text>
              <View style={styles.greetingRow}>
                <Text style={styles.greetingText} numberOfLines={1}>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'} </Text>
                <Text style={styles.userName} numberOfLines={1} ellipsizeMode="tail">{userData?.fullName || 'User'}</Text>
              </View>
              {syncLoading && (
                <View style={styles.syncBadge}>
                  <ActivityIndicator size="small" color="#5B4BFF" />
                  <Text style={styles.syncText}>Syncing...</Text>
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={styles.bellButton}
            onPress={() => NavigationService.navigate('Notifications')}
          >
            <Bell size={24} color="#1E293B" />
            {unreadNotificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* TABS */}
        <Animated.View style={[
          styles.tabContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: cardSlide }],
          }
        ]}>
          {['Check', 'Leave'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
              onPress={() => handleTabPress(tab as any)}
            >
              {tab === 'Check' && <CheckCircle size={18} color={activeTab === 'Check' ? '#FFF' : '#64748B'} style={{ marginRight: 6 }} />}
              {tab === 'Leave' && <LogOut size={18} color={activeTab === 'Leave' ? '#FFF' : '#64748B'} style={{ marginRight: 6 }} />}
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === 'Break' ? 'Break Time' : tab}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>

        {/* ATTENDANCE CARD */}
        <Animated.View style={[
          styles.attendanceCardWrapper,
          {
            opacity: fadeAnim,
            transform: [{ translateY: cardSlide }],
          }
        ]}>
          <View style={styles.mainAttendanceCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardHeaderLeft}>
                <Text style={styles.cardHeaderLabel}>Status</Text>
                <Text
                  style={[
                    styles.cardHeaderStatus,
                    {
                      color: attendanceStatus?.toLowerCase() === 'ontime'
                        ? '#047857'
                        : attendanceStatus?.toLowerCase() === 'late'
                          ? '#B45309'
                          : '#64748B',
                    },
                  ]}
                >
                  {(attendanceStatus || 'Not Marked').toUpperCase()}
                </Text>
              </View>

              {isCheckedIn && (
                <TouchableOpacity
                  style={[
                    styles.breakHeaderButton,
                    isBreakActive ? styles.breakHeaderButtonActive : styles.breakHeaderButtonInactive,
                    (breakLoading || syncLoading || loading) && styles.breakButtonDisabled,
                  ]}
                  onPress={handleBreakTogglePress}
                  activeOpacity={0.85}
                  disabled={breakLoading || syncLoading || loading}
                >
                  {breakLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Coffee size={14} color="#FFFFFF" />
                  )}
                  <Text style={styles.breakHeaderButtonText}>{isBreakActive ? 'End Break' : 'Start Break'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.cardHeaderDivider} />

            <View style={styles.cardInternalLayout}>
              {/* Left Column: Stats */}
              <View style={styles.cardLeftCol}>
                <View style={styles.timeInfoItem}>
                  <View style={styles.iconBox}><Clock size={18} color="#5B4BFF" /></View>
                  <View>
                    <Text style={styles.timeLabel}>Check In Time</Text>
                    <Text style={styles.timeValue}>{checkInTime}</Text>
                  </View>
                </View>
                <View style={[styles.timeInfoItem, { marginTop: 16 }]}>
                  <View style={styles.iconBox}><Timer size={18} color="#5B4BFF" /></View>
                  <View>
                    <Text style={styles.timeLabel}>Working Time</Text>
                    <Text style={styles.timeValue}>{workedTime}</Text>
                  </View>
                </View>
              </View>

              {/* Right Column: Action */}
              <View style={styles.cardRightCol}>
                {!isCheckedIn && !isAllowToMark ? (
                   <View style={styles.completedBadge}>
                      <CheckCircle size={32} color="#10B981" />
                      <Text style={styles.completedText}>Completed</Text>
                   </View>
                ) : (
                  <>
                    {biometricsAvailable === false ? (
                      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <TouchableOpacity
                          style={[styles.simpleButton, isCheckedIn ? styles.btnRed : styles.btnBlue]}
                          activeOpacity={0.85}
                          onPress={handleAttendancePress}
                          disabled={loading}
                        >
                          {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.simpleButtonText}>{isCheckedIn ? 'Check Out' : 'Check In'}</Text>}
                        </TouchableOpacity>
                      </Animated.View>
                    ) : (
                      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                        <Animated.View style={[styles.glowRing, { opacity: glowAnim, backgroundColor: isCheckedIn ? '#EF444420' : '#5B4BFF20' }]} />
                        <TouchableOpacity
                          style={[styles.checkOutButton, isCheckedIn ? styles.btnRed : styles.btnBlue]}
                          activeOpacity={0.85}
                          onPress={handleAttendancePress}
                          disabled={loading || syncLoading}
                        >
                          {(loading || syncLoading) ? <ActivityIndicator size="small" color="#FFF" /> : <Fingerprint size={40} color="#FFF" />}
                          <Text style={styles.checkOutText}>{isCheckedIn ? 'Check Out' : 'Check In'}</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    )}
                  </>
                )}
              </View>
            </View>

            {/* Bottom Message */}
            {attendanceMessage && (
              <View style={styles.messageFooter}>
                 <Text style={styles.attendanceMessageText}>{attendanceMessage}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {/* Quick Help / Manual Request Card */}
        <Animated.View style={[
          styles.quickHelpContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: cardSlide }],
          }
        ]}>
          <TouchableOpacity 
            style={styles.quickHelpCard}
            onPress={() => NavigationService.navigate('AttendanceRequest')}
            activeOpacity={0.8}
          >
            <View style={styles.quickHelpIcon}>
              <AlertCircle size={22} color="#5B4BFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickHelpTitle}>Forgot to check in?</Text>
              <Text style={styles.quickHelpSubtitle}>Submit a manual attendance request here</Text>
            </View>
            <ArrowRight size={20} color="#64748B" />
          </TouchableOpacity>
        </Animated.View>

        {/* TODAY TIME LOG GRID */}
        {/* <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today Time Log</Text>
          <Text style={styles.sectionSubtitle}>An Overview Of Your Progress</Text>
        </View>
        <View style={styles.statsGrid}>
          {timeLogs.map((item, index) => (
            <View key={index} style={[styles.statCard, { backgroundColor: item.color }]}>
              <Text style={styles.statTime}>{item.time}</Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View> */}

        {/* THIS MONTH — PIXEL-PERFECT CHART */}
        <Animated.View style={[
          styles.chartSection,
          {
            opacity: fadeAnim,
            transform: [{ translateY: statsSlide }],
          }
        ]}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>This Month</Text>
              <Text style={styles.chartSubtitle}>Monthly Attendance Overview</Text>
            </View>
            <Text style={styles.totalDays}>
              Total: {employeeStats ? employeeStats.onTimeDays + employeeStats.lateDays + employeeStats.onLeaveDays + employeeStats.absentDays : 0} days
            </Text>
          </View>

          <View style={styles.chartContainer}>
            {employeeStats ? (
              <View style={styles.barsContainer}>
                {[
                  { label: 'On Time', value: employeeStats.onTimeDays, color: '#10B981' },
                  { label: 'Late', value: employeeStats.lateDays, color: '#F59E0B' },
                  { label: 'On Leave', value: employeeStats.onLeaveDays, color: '#3B82F6' },
                  { label: 'Absent', value: employeeStats.absentDays, color: '#EF4444' },
                ].map((item, index) => {
                  const maxValue = Math.max(
                    employeeStats.onTimeDays,
                    employeeStats.lateDays,
                    employeeStats.onLeaveDays,
                    employeeStats.absentDays,
                    1 // Minimum to prevent division by zero
                  );
                  const barHeight = item.value > 0 ? Math.max((item.value / maxValue) * 140, 8) : 8;

                  return (
                    <View key={index} style={styles.barItem}>
                      {/* Bar with rounded corners */}
                      <View style={[styles.bar, { height: barHeight, backgroundColor: item.color }]} />

                      {/* Label & Count */}
                      <Text style={styles.barLabel}>{item.label}</Text>
                      {item.value > 0 && <Text style={styles.barCount}>{item.value} days</Text>}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.loadingChart}>
                <ActivityIndicator size="small" color="#5B4BFF" />
                <Text style={styles.loadingChartText}>Loading monthly stats...</Text>
              </View>
            )}
          </View>
        </Animated.View>


      </ScrollView>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        visible={showImagePreview}
        imageUri={userData?.profilePhotoUrl || null}
        onClose={() => setShowImagePreview(false)}
      />

      {/* Break Reason Modal */}
      <Modal
        visible={showBreakReasonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBreakReasonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reasonModalContainer}>
            <Text style={styles.reasonModalTitle}>Start Break</Text>
            <Text style={styles.reasonModalSubtitle}>
              Please provide a reason for your break
            </Text>
            
            <TextInput
              style={styles.reasonInput}
              placeholder="Enter break reason..."
              placeholderTextColor="#94A3B8"
              value={breakReason}
              onChangeText={setBreakReason}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
              editable={!breakLoading}
            />
            
            <View style={styles.reasonModalButtons}>
              <TouchableOpacity
                style={[styles.reasonModalButton, styles.reasonCancelButton]}
                onPress={() => {
                  if (breakLoading) return;
                  setShowBreakReasonModal(false);
                  setBreakReason('');
                }}
                disabled={breakLoading}
              >
                <Text style={styles.reasonCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.reasonModalButton, styles.reasonSubmitButton]}
                onPress={handleBreakStartConfirm}
                disabled={!breakReason.trim() || breakLoading}
              >
                {breakLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.reasonSubmitButtonText}>Start Break</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

// ────────────────────────────── STYLES ──────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  blob: { position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: '#5B4BFF10' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, marginBottom: 24 },
  userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  avatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12, borderWidth: 2, borderColor: '#FFF' },
  defaultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: { flex: 1, minWidth: 0, marginRight: 12 },
  dateText: { fontSize: 13, color: '#64748B', marginBottom: 2 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  greetingText: { fontSize: 18, fontWeight: '700', color: '#0F172A', flexShrink: 0 },
  userName: { fontSize: 18, color: '#0F172A', flexShrink: 1, minWidth: 0 },
  bellButton: {
    width: 44,
    height: 44,
    backgroundColor: '#FFF',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  tabContainer: { flexDirection: 'row', backgroundColor: '#FFF', marginHorizontal: 24, borderRadius: 16, padding: 6, marginBottom: 24, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  tabButton: { flex: 1, flexDirection: 'row', paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  activeTabButton: { backgroundColor: '#5B4BFF', shadowColor: '#5B4BFF', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  activeTabText: { color: '#FFFFFF' },

  breakHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 3,
  },
  breakHeaderButtonInactive: {
    backgroundColor: '#5B4BFF',
    shadowColor: '#5B4BFF',
  },
  breakHeaderButtonActive: {
    backgroundColor: '#F59E0B',
    shadowColor: '#F59E0B',
  },
  breakButtonDisabled: {
    opacity: 0.45,
  },
  breakHeaderButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flexDirection: 'column',
  },
  cardHeaderLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardHeaderStatus: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  cardHeaderDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 16,
  },

  attendanceCardWrapper: {
    marginHorizontal: 24,
    marginBottom: 24,
    position: 'relative',
    zIndex: 10,
    elevation: 8,
  },
  mainAttendanceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#5B4BFF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(91, 75, 255, 0.05)',
  },
  cardInternalLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeftCol: {
    flex: 1,
  },
  cardRightCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 20,
  },
  timeInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadgeContainer: {
    position: 'absolute',
    top: -14,
    alignSelf: 'center',
    zIndex: 20,
    elevation: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeLabel: { fontSize: 12, color: '#94A3B8', marginBottom: 2, fontWeight: '600' },
  timeValue: { fontSize: 18, color: '#1E293B', fontWeight: '800' },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  messageFooter: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  attendanceMessageText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 18,
  },
  completedBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  actionContainer: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
    position: 'relative',
  },
  glowRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    top: '50%',
    left: '50%',
    marginLeft: -70,
    marginTop: -70,
  },
  checkOutButton: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  checkOutText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 8 },
  simpleButton: {
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  simpleButtonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  quickHelpContainer: {
    marginHorizontal: 24,
    marginBottom: 24,
  },
  quickHelpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  quickHelpIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  quickHelpTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  quickHelpSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  btnRed: { backgroundColor: '#EF4444', borderColor: '#FEF2F2', shadowColor: '#EF4444' },
  btnBlue: { backgroundColor: '#5B4BFF', borderColor: '#E0E7FF', shadowColor: '#5B4BFF' },

  sectionHeader: { paddingHorizontal: 24, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  sectionSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 12 },
  statCard: { width: (width - 48 - 24) / 3, paddingVertical: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  statTime: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#64748B', textAlign: 'center' },

  // ──────── THIS MONTH CHART – CLEAN & PREMIUM ────────
  // ──────── THIS MONTH CHART – PIXEL-PERFECT & RESPONSIVE ────────
  chartSection: {
    marginTop: 32,
    paddingHorizontal: 24,
  },

  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
  },

  chartTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },

  chartSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },

  totalDays: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },

  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 12,
  },

  barsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    height: 200,
    paddingBottom: 12,
    gap: 8,
  },

  barItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },

  bar: {
    width: 28,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    minHeight: 8,
  },

  barLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  barCount: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
    textAlign: 'center',
  },

  loadingChart: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingChartText: {
    marginTop: 12,
    fontSize: 14,
    color: '#94A3B8',
  },

  // Reason Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  reasonModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  reasonModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  reasonModalSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 20,
  },
  reasonInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#0F172A',
    minHeight: 120,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    marginBottom: 20,
  },
  reasonModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  reasonModalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonCancelButton: {
    backgroundColor: '#F1F5F9',
  },
  reasonCancelButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
  },
  reasonSubmitButton: {
    backgroundColor: '#5B4BFF',
    shadowColor: '#5B4BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  reasonSubmitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  syncText: {
    fontSize: 11,
    color: '#5B4BFF',
    fontWeight: '600',
  },
});