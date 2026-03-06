import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { subscriptionService } from '../services/subscriptionService';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/useAuthStore';

export default function BetaAccessScreen() {
  const [promoCode, setPromoCode] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<'monthly' | 'yearly' | null>(null);
  const { logout } = useAuthStore();

  const handleRedeemCode = async () => {
    if (!promoCode.trim()) {
      Alert.alert('Error', 'Please enter a promo code.');
      return;
    }

    setPromoLoading(true);
    try {
      const result = await subscriptionService.redeemCode(promoCode.trim());
      Alert.alert('Success', result.message);
      await authService.getProfile(); // Refresh user to trigger navigation
    } catch (err: any) {
      Alert.alert('Invalid Code', err.message || 'That code is not valid.');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    setCheckoutLoading(plan);
    try {
      const url = await subscriptionService.createCheckout(plan);
      await WebBrowser.openBrowserAsync(url);
      // After returning from browser, poll until webhook updates subscription
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await authService.getProfile();
          const status = await subscriptionService.getStatus();
          if (status.has_access) return; // Profile refresh triggers nav update
        } catch { /* keep polling */ }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start checkout.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Get Started with Draft</Text>
      <Text style={styles.subtitle}>
        AI-powered cycling coach that adapts to you
      </Text>

      {/* Plans */}
      <Text style={styles.sectionTitle}>Choose a Plan</Text>
      <Text style={styles.trialNote}>7-day free trial on all plans. Cancel anytime.</Text>

      {/* Monthly */}
      <TouchableOpacity
        style={styles.planCard}
        onPress={() => handleSubscribe('monthly')}
        disabled={!!checkoutLoading}
      >
        <View style={styles.planInfo}>
          <Text style={styles.planName}>Monthly</Text>
          <Text style={styles.planDesc}>Cancel anytime</Text>
        </View>
        <View style={styles.planPriceWrap}>
          <Text style={styles.planPrice}>$9.99</Text>
          <Text style={styles.planInterval}>/month</Text>
        </View>
        {checkoutLoading === 'monthly' && <ActivityIndicator color="#3b82f6" style={styles.planSpinner} />}
      </TouchableOpacity>

      {/* Yearly */}
      <View style={styles.bestValueWrap}>
        <View style={styles.bestValueBadge}>
          <Text style={styles.bestValueText}>BEST VALUE</Text>
        </View>
        <TouchableOpacity
          style={[styles.planCard, styles.yearlyCard]}
          onPress={() => handleSubscribe('yearly')}
          disabled={!!checkoutLoading}
        >
          <View style={styles.planInfo}>
            <Text style={styles.planName}>Yearly</Text>
            <Text style={styles.planDesc}>Save 34%</Text>
          </View>
          <View style={styles.planPriceWrap}>
            <Text style={styles.planPrice}>$79</Text>
            <Text style={styles.planInterval}>/year ($6.58/mo)</Text>
          </View>
          {checkoutLoading === 'yearly' && <ActivityIndicator color="#3b82f6" style={styles.planSpinner} />}
        </TouchableOpacity>
      </View>

      {/* Promo Code */}
      <Text style={styles.promoLabel}>Have a promo code?</Text>
      <View style={styles.promoRow}>
        <TextInput
          style={styles.promoInput}
          value={promoCode}
          onChangeText={(t) => setPromoCode(t.toUpperCase())}
          placeholder="Enter code"
          placeholderTextColor="#64748b"
          autoCapitalize="characters"
          returnKeyType="done"
          onSubmitEditing={handleRedeemCode}
        />
        <TouchableOpacity
          style={[styles.promoBtn, (!promoCode.trim() || promoLoading) && styles.promoBtnDisabled]}
          onPress={handleRedeemCode}
          disabled={!promoCode.trim() || promoLoading}
        >
          {promoLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.promoBtnText}>Apply</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.logoutLink} onPress={logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, paddingTop: 80 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 4,
  },
  trialNote: {
    fontSize: 13,
    color: '#94a3b8',
    marginBottom: 12,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#334155',
  },
  yearlyCard: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e293b',
  },
  bestValueWrap: { position: 'relative' },
  bestValueBadge: {
    position: 'absolute',
    top: -10,
    left: 16,
    zIndex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  bestValueText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  planInfo: { flex: 1 },
  planName: { fontSize: 16, fontWeight: '600', color: '#f1f5f9' },
  planDesc: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 22, fontWeight: '700', color: '#f1f5f9' },
  planInterval: { fontSize: 12, color: '#94a3b8' },
  planSpinner: { marginLeft: 8 },
  promoLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 20,
    marginBottom: 8,
  },
  promoRow: { flexDirection: 'row', gap: 10 },
  promoInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#f1f5f9',
    letterSpacing: 1,
  },
  promoBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  promoBtnDisabled: { opacity: 0.5 },
  promoBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  logoutLink: { alignItems: 'center', marginTop: 32 },
  logoutText: { color: '#64748b', fontSize: 14 },
});
