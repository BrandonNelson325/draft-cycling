import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import type { TrainingPlanTemplate } from '../../types/shared';
import Badge from '../ui/Badge';

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner: { bg: '#052e16', text: '#4ade80' },
  intermediate: { bg: '#2d1f00', text: '#fbbf24' },
  advanced: { bg: '#3f1020', text: '#f87171' },
};

interface PlanTemplateCardProps {
  template: TrainingPlanTemplate;
  onSelect: (template: TrainingPlanTemplate) => void;
}

export default function PlanTemplateCard({ template, onSelect }: PlanTemplateCardProps) {
  const colors = DIFFICULTY_COLORS[template.difficulty_level] || DIFFICULTY_COLORS.intermediate;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onSelect(template)}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{template.name}</Text>
        <Badge
          label={template.difficulty_level}
          color={colors.bg}
          textColor={colors.text}
        />
      </View>

      <Text style={styles.description} numberOfLines={2}>{template.description}</Text>

      <View style={styles.meta}>
        <Text style={styles.metaText}>{template.duration_weeks} weeks</Text>
        <Text style={styles.metaDot}>{'\u00B7'}</Text>
        <Text style={styles.metaText}>{template.days_per_week} days/wk</Text>
        <Text style={styles.metaDot}>{'\u00B7'}</Text>
        <Text style={styles.metaText}>{template.hours_per_week_min}{'\u2013'}{template.hours_per_week_max} hrs/wk</Text>
      </View>

      {template.target_event && (
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{template.target_event}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  description: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: { fontSize: 12, color: '#64748b' },
  metaDot: { fontSize: 12, color: '#475569' },
  tagRow: { flexDirection: 'row', marginTop: 4 },
  tag: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontSize: 11, color: '#64748b' },
});
