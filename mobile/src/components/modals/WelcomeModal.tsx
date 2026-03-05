import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface WelcomeModalProps {
  visible: boolean;
  onClose: () => void;
  showWelcome?: boolean;
}

const features = [
  {
    icon: 'pulse-outline' as const,
    title: 'Training Status',
    description:
      'Your dashboard shows a real-time freshness score based on your recent training load. See at a glance whether you\'re ready to push hard or need recovery.',
    color: '#3b82f6',
    bg: '#1e3a5f',
  },
  {
    icon: 'navigate-outline' as const,
    title: 'Strava Sync',
    description:
      'Connect Strava and your rides sync automatically. We track your power, TSS, and fitness trends so everything stays up to date.',
    color: '#f97316',
    bg: '#431407',
  },
  {
    icon: 'chatbubbles-outline' as const,
    title: 'AI Coach',
    description:
      'Chat with your AI cycling coach anytime. Get feedback on your training, ask for advice, or talk through race strategy. It knows your fitness and history.',
    color: '#a855f7',
    bg: '#3b0764',
  },
  {
    icon: 'barbell-outline' as const,
    title: 'Custom Workouts',
    description:
      'Ask the coach to build a workout for you — VO2max intervals, sweet spot, recovery spins, anything. It creates structured workouts with power targets you can download.',
    color: '#22c55e',
    bg: '#052e16',
  },
  {
    icon: 'calendar-outline' as const,
    title: 'Training Plans',
    description:
      'Need a full plan? Tell the coach your goal and timeline and it\'ll build a periodized plan on your calendar — from base through race day.',
    color: '#ef4444',
    bg: '#450a0a',
  },
];

export default function WelcomeModal({ visible, onClose, showWelcome = true }: WelcomeModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const showingWelcome = showWelcome && currentIndex === 0;
  const featureIndex = showWelcome ? currentIndex - 1 : currentIndex;
  const totalSteps = features.length + (showWelcome ? 1 : 0);
  const isLastStep = currentIndex === totalSteps - 1;

  const handleNext = () => {
    if (isLastStep) {
      setCurrentIndex(0);
      onClose();
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleClose = () => {
    setCurrentIndex(0);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {showingWelcome ? 'Welcome to Draft!' : features[featureIndex].title}
            </Text>
            {/* Step dots */}
            <View style={styles.dots}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    i === currentIndex ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Content */}
          <View style={styles.content}>
            {showingWelcome ? (
              <>
                <Text style={styles.body}>
                  Draft is your AI-powered cycling coach. It learns from your rides,
                  tracks your fitness, and gives you personalized training guidance — all in one place.
                </Text>
                <Text style={styles.bodyHint}>
                  Here's a quick look at what you can do.
                </Text>
              </>
            ) : (
              <>
                <View style={[styles.iconCircle, { backgroundColor: features[featureIndex].bg }]}>
                  <Ionicons
                    name={features[featureIndex].icon}
                    size={24}
                    color={features[featureIndex].color}
                  />
                </View>
                <Text style={styles.body}>
                  {features[featureIndex].description}
                </Text>
              </>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {currentIndex > 0 ? (
              <TouchableOpacity onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextText}>
                {isLastStep ? "Let's Go" : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: Math.min(width - 48, 400),
    backgroundColor: '#1e293b',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
  dotActive: {
    width: 24,
    backgroundColor: '#fff',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  content: {
    padding: 20,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 22,
  },
  bodyHint: {
    fontSize: 14,
    color: '#64748b',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backText: {
    fontSize: 14,
    color: '#64748b',
  },
  nextBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
