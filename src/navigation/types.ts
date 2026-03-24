import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { CompositeScreenProps } from '@react-navigation/native';

export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  Register: undefined;
};

export type SettingsStackParamList = {
  SettingsHome: { onLogout: () => void };
  CompanyProfile: undefined;
  Notifications: undefined;
  Terms: undefined;
  HelpCenter: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Settings: undefined;
};

// --- Screen Props ---
export type LandingScreenProps = NativeStackScreenProps<AuthStackParamList, 'Landing'>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export type DashboardScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Dashboard'>,
  NativeStackScreenProps<AuthStackParamList>
>;

export type SettingsScreenProps = NativeStackScreenProps<SettingsStackParamList, 'SettingsHome'>;
export type CompanyProfileScreenProps = NativeStackScreenProps<SettingsStackParamList, 'CompanyProfile'>;
export type NotificationsScreenProps = NativeStackScreenProps<SettingsStackParamList, 'Notifications'>;
export type TermsScreenProps = NativeStackScreenProps<SettingsStackParamList, 'Terms'>;
export type HelpCenterScreenProps = NativeStackScreenProps<SettingsStackParamList, 'HelpCenter'>;
