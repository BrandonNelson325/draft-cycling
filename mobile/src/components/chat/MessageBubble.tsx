import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
}

const markdownStyles = {
  body: {
    color: '#f1f5f9',
    fontSize: 14,
    lineHeight: 20,
  },
  strong: { color: '#f1f5f9', fontWeight: '700' as const },
  em: { color: '#f1f5f9', fontStyle: 'italic' as const },
  code_inline: {
    backgroundColor: '#0f172a',
    color: '#60a5fa',
    paddingHorizontal: 4,
    borderRadius: 4,
    fontSize: 13,
  },
  fence: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
  },
  code_block: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    color: '#a5f3fc',
    fontSize: 13,
  },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { marginBottom: 2 },
  link: { color: '#60a5fa' },
  heading1: { color: '#f1f5f9', fontWeight: '700' as const, fontSize: 18 },
  heading2: { color: '#f1f5f9', fontWeight: '700' as const, fontSize: 16 },
  heading3: { color: '#f1f5f9', fontWeight: '600' as const, fontSize: 15 },
  paragraph: { marginVertical: 4 },
};

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <View style={[styles.wrapper, isUser ? styles.wrapperUser : styles.wrapperAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {isUser ? (
          <Text style={styles.userText}>{content}</Text>
        ) : (
          <Markdown style={markdownStyles}>{content || ''}</Markdown>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 4,
    marginHorizontal: 12,
  },
  wrapperUser: {
    alignItems: 'flex-end',
  },
  wrapperAssistant: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: 12,
  },
  bubbleUser: {
    backgroundColor: '#1e3a5f',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#1e293b',
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#f1f5f9',
    fontSize: 14,
    lineHeight: 20,
  },
});
