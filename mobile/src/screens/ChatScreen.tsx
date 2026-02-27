import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetFlatList, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useChatStore } from '../stores/useChatStore';
import MessageBubble from '../components/chat/MessageBubble';
import LoadingDots from '../components/chat/LoadingDots';
import type { MainTabScreenProps } from '../navigation/types';

export default function ChatScreen({ route, navigation }: MainTabScreenProps<'Chat'>) {
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const initialMessageSent = useRef(false);

  const {
    conversations,
    activeConversationId,
    messages,
    loading,
    loadConversations,
    selectConversation,
    sendMessage,
    clearActiveConversation,
    deleteConversation,
  } = useChatStore();

  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  useEffect(() => {
    loadConversations();
  }, []);

  // Handle initialMessage param from navigation
  useEffect(() => {
    const initialMessage = route.params?.initialMessage;
    if (initialMessage && !initialMessageSent.current && !loading) {
      initialMessageSent.current = true;
      handleSend(initialMessage);
    }
  }, [route.params?.initialMessage, loading]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [activeMessages.length, loading]);

  const handleSend = async (overrideText?: string) => {
    const text = overrideText || inputText.trim();
    if (!text || loading) return;

    if (!overrideText) setInputText('');

    try {
      await sendMessage(text);
    } catch {
      Alert.alert('Error', 'Failed to send message. Please try again.');
    }
  };

  const handleDeleteConversation = (id: string) => {
    Alert.alert('Delete Conversation', 'Remove this conversation?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteConversation(id),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        {activeConversationId ? (
          <TouchableOpacity
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={clearActiveConversation}
          >
            <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
        <Text style={styles.headerTitle}>AI Coach</Text>
        <TouchableOpacity
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => {
            loadConversations();
            sheetRef.current?.snapToIndex(0);
          }}
        >
          <Ionicons name="list-outline" size={22} color="#f1f5f9" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {!activeConversationId ? (
          <View style={styles.startContainer}>
            <Text style={styles.startTitle}>AI Cycling Coach</Text>
            <Text style={styles.startSubtitle}>
              Ask about training, workouts, nutrition, race strategy, and more.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={activeMessages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <MessageBubble role={item.role} content={item.content} />
            )}
            ListFooterComponent={loading ? <LoadingDots /> : null}
            contentContainerStyle={styles.messages}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask your coach anything..."
            placeholderTextColor="#475569"
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!inputText.trim() || loading}
          >
            <Ionicons name="send" size={18} color={inputText.trim() && !loading ? '#fff' : '#475569'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Conversations sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['70%']}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Conversations</Text>
          <TouchableOpacity
            style={styles.newConvBtn}
            onPress={() => {
              clearActiveConversation();
              sheetRef.current?.close();
            }}
          >
            <Ionicons name="add" size={16} color="#60a5fa" />
            <Text style={styles.newConvText}>New</Text>
          </TouchableOpacity>
        </View>

        <BottomSheetFlatList
          data={conversations}
          keyExtractor={(c: import('../services/chatService').ChatConversation) => c.id}
          renderItem={({ item: conv }: { item: import('../services/chatService').ChatConversation }) => (
            <TouchableOpacity
              style={[
                styles.convItem,
                conv.id === activeConversationId && styles.convItemActive,
              ]}
              onPress={() => {
                selectConversation(conv.id);
                sheetRef.current?.close();
              }}
              onLongPress={() => handleDeleteConversation(conv.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.convTitle} numberOfLines={1}>
                  {conv.title || 'Conversation'}
                </Text>
                <Text style={styles.convDate}>
                  {new Date(conv.updated_at || conv.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#475569" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyConvs}>No conversations yet. Start chatting!</Text>
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  startContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  startTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f1f5f9',
    textAlign: 'center',
  },
  startSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  messages: {
    paddingVertical: 12,
    flexGrow: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#f1f5f9',
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#1e293b' },
  sheetBg: { backgroundColor: '#1e293b' },
  sheetHandle: { backgroundColor: '#475569' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  newConvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
  },
  newConvText: { color: '#60a5fa', fontWeight: '600', fontSize: 13 },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  convItemActive: { backgroundColor: '#1a2847' },
  convTitle: { fontSize: 14, fontWeight: '500', color: '#f1f5f9' },
  convDate: { fontSize: 12, color: '#64748b', marginTop: 2 },
  emptyConvs: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    padding: 24,
  },
});
