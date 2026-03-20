import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../../navigation/types';
import { trainingPlanService } from '../../services/trainingPlanService';
import type { TrainingPlan } from '../../services/trainingPlanService';
import type { TrainingPlanTemplate } from '../../types/shared';
import PlanTemplateCard from './PlanTemplateCard';
import EmptyState from '../ui/EmptyState';

const FILTERS = ['all', 'beginner', 'intermediate', 'advanced'] as const;

interface PlanTemplateListProps {
  activePlan: TrainingPlan | null;
}

export default function PlanTemplateList({ activePlan }: PlanTemplateListProps) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [templates, setTemplates] = useState<TrainingPlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await trainingPlanService.getTemplates();
      setTemplates(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? templates
    : templates.filter(t => t.difficulty_level === filter);

  const handleSelect = (template: TrainingPlanTemplate) => {
    navigation.navigate('Chat', {
      initialMessage: `I'd like to start the ${template.name} training plan.`,
    });
  };

  const renderHeader = () => (
    <View>
      {/* Active plan banner */}
      {activePlan && (
        <View style={styles.banner}>
          <View>
            <Text style={styles.bannerLabel}>Active Plan</Text>
            <Text style={styles.bannerTitle}>{activePlan.goal_event}</Text>
          </View>
        </View>
      )}

      {/* Custom plan button */}
      <TouchableOpacity
        style={styles.customPlanBtn}
        onPress={() => navigation.navigate('Chat', {
          initialMessage: 'I want to create a custom training plan',
        })}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.customPlanText}>Create a custom plan</Text>
          <Text style={styles.customPlanSub}>Tell the coach your goals and get a personalized plan</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#bfdbfe" />
      </TouchableOpacity>

      {/* Filter chips */}
      <FlatList
        data={[...FILTERS]}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={f => f}
        style={styles.filterList}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <EmptyState
          icon="alert-circle-outline"
          title="Failed to load plans"
          subtitle="Tap to retry"
          actionLabel="Retry"
          onAction={loadTemplates}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <PlanTemplateCard template={item} onSelect={handleSelect} />
        )}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="No plans match your filter"
            subtitle="Try a different difficulty level"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingTop: 0 },
  customPlanBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customPlanText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  customPlanSub: {
    fontSize: 12,
    color: '#bfdbfe',
    marginTop: 3,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  bannerLabel: { fontSize: 11, color: '#93c5fd', fontWeight: '500' },
  bannerTitle: { fontSize: 14, color: '#f1f5f9', fontWeight: '600', marginTop: 2 },
  filterList: { maxHeight: 52 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  chipActive: { backgroundColor: '#1e3a5f' },
  chipText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#60a5fa' },
});
