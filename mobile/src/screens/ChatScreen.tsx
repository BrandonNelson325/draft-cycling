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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetFlatList, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useChatStore } from '../stores/useChatStore';
import { trainingPlanService } from '../services/trainingPlanService';
import { routeService } from '../services/routeService';
import MessageBubble from '../components/chat/MessageBubble';
import LoadingDots from '../components/chat/LoadingDots';
import type { MainTabScreenProps } from '../navigation/types';

// Messages the plan-start buttons send. For these we start a brand-new chat so
// the plan setup isn't polluted by a prior conversation's context.
const PLAN_START_TRIGGERS = [
  'I want to create a custom training plan',
  'I want to create a new training plan',
];

export default function ChatScreen({ route, navigation }: MainTabScreenProps<'Chat'>) {
  const [inputText, setInputText] = useState('');
  const [hasActivePlan, setHasActivePlan] = useState(false);
  const [analyzingRoute, setAnalyzingRoute] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const sheetRef = useRef<BottomSheet>(null);
  const tabBarHeight = useBottomTabBarHeight();

  const startingConversation = useRef(false);

  const {
    conversations,
    activeConversationId,
    messages,
    loading,
    streamingContent,
    toolStatus,
    loadConversations,
    startConversation,
    selectConversation,
    sendMessage,
    clearActiveConversation,
    deleteConversation,
    refreshActiveMessages,
  } = useChatStore();

  const activeMessages = activeConversationId ? messages[activeConversationId] || [] : [];

  // Refetch on focus so a plan that finished building in the background (its
  // result message + any server-side recovery message) shows up when the user
  // returns to the chat — e.g. after tapping the "plan ready" notification.
  useFocusEffect(
    React.useCallback(() => {
      if (activeConversationId && !loading) {
        refreshActiveMessages();
      }
    }, [activeConversationId, loading])
  );

  useEffect(() => {
    trainingPlanService.getActivePlan().then(plan => setHasActivePlan(!!plan)).catch(() => {});
  }, []);

  // Load conversations on mount and resume the most recent
  useEffect(() => {
    const init = async () => {
      if (startingConversation.current) return;
      startingConversation.current = true;
      try {
        await loadConversations();
        const { conversations, activeConversationId } = useChatStore.getState();
        if (activeConversationId || route.params?.initialMessage) return;
        if (conversations.length > 0) {
          await selectConversation(conversations[0].id);
        } else {
          await startConversation();
        }
      } finally {
        startingConversation.current = false;
      }
    };
    init();
  }, []);

  // Handle initialMessage param from navigation. We CONSUME the param (set it
  // back to undefined) after handling so navigating again with the same message
  // re-fires it — without this, a second "Create custom plan" tap in the same
  // session did nothing. For plan-start triggers we clear the active
  // conversation first so it always opens a fresh chat instead of dropping the
  // message into whatever conversation was last open.
  useEffect(() => {
    const initialMessage = route.params?.initialMessage;
    if (initialMessage && !loading) {
      navigation.setParams({ initialMessage: undefined } as any);
      if (PLAN_START_TRIGGERS.includes(initialMessage)) {
        clearActiveConversation();
      }
      handleSend(initialMessage);
    }
  }, [route.params?.initialMessage, loading]);

  // Scroll to bottom on new messages, streaming tokens, and tool-progress updates
  useEffect(() => {
    if (activeMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [activeMessages.length, loading, streamingContent, toolStatus]);

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

  /**
   * Pick a GPX file, send it to the backend for analysis, then auto-send
   * the route summary as a chat message so the AI sees it as context.
   */
  const handleAttachGpx = async () => {
    if (analyzingRoute || loading) return;
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        // GPX has no universal MIME type — accept any and validate by
        // extension + content sniff below.
        type: ['application/gpx+xml', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (pick.canceled || !pick.assets?.[0]) return;

      const asset = pick.assets[0];
      const lowerName = (asset.name || '').toLowerCase();

      // Specific message for the most common wrong-file mistake: FIT routes.
      if (lowerName.endsWith('.fit')) {
        Alert.alert(
          'FIT files not supported',
          "We only support GPX routes right now. In Strava/Garmin Connect/Komoot, export your route as GPX instead and try again."
        );
        return;
      }
      if (!lowerName.endsWith('.gpx')) {
        Alert.alert(
          'Wrong file type',
          'Please pick a .gpx route file. Most cycling platforms (Strava, Komoot, RWGPS, Garmin Connect) have a GPX export option.'
        );
        return;
      }

      setAnalyzingRoute(true);
      const gpxContent = await FileSystem.readAsStringAsync(asset.uri);

      // Content sniff: GPX is XML, must contain a <gpx tag near the top.
      // Catches files that have a .gpx extension but aren't actually GPX
      // (e.g. corrupt downloads, mislabelled FIT exports, empty files).
      if (!gpxContent.slice(0, 4096).includes('<gpx')) {
        Alert.alert(
          'Not a valid GPX file',
          "That file doesn't look like GPX content. Re-export your route from the source app and try again."
        );
        return;
      }

      // Trim GPX down to only the data the analyzer reads (lat/lon/ele).
      // <time>, <extensions>, <cmt>, <desc> nodes can multiply file size 3-5×
      // on long routes — without these a 200-mile race route drops from ~12MB
      // to ~2MB, well under the upload limit.
      const trimmed = gpxContent
        .replace(/<time>[\s\S]*?<\/time>/g, '')
        .replace(/<extensions>[\s\S]*?<\/extensions>/g, '')
        .replace(/<cmt>[\s\S]*?<\/cmt>/g, '')
        .replace(/<desc>[\s\S]*?<\/desc>/g, '');

      const analysis = await routeService.analyzeGpx(trimmed, asset.name);
      await sendMessage(analysis.summary);
    } catch (err: any) {
      // Show the backend's actual error message rather than a generic
      // "Could not analyze route" — far more diagnostic for the user.
      const backendMessage =
        err?.response?.data?.error || err?.response?.data?.message;
      Alert.alert(
        'Could not analyze route',
        backendMessage || err?.message || 'Pick a valid GPX file and try again.'
      );
    } finally {
      setAnalyzingRoute(false);
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => navigation.navigate('Dashboard')}
        >
          <Ionicons name="arrow-back" size={22} color="#f1f5f9" />
        </TouchableOpacity>
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
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.startSubtitle}>Starting conversation...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={activeMessages}
            keyExtractor={m => m.id}
            renderItem={({ item }) => (
              <MessageBubble role={item.role} content={item.content} />
            )}
            ListFooterComponent={
              loading ? (
                <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                  {toolStatus ? (
                    <View style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 4 }}>
                      <Text style={{ color: '#60a5fa', fontSize: 13, fontStyle: 'italic' }}>{toolStatus}</Text>
                    </View>
                  ) : null}
                  {streamingContent ? (
                    <MessageBubble role="assistant" content={streamingContent} />
                  ) : (
                    <LoadingDots />
                  )}
                </View>
              ) : null
            }
            ListEmptyComponent={
              !hasActivePlan && !loading ? (
                <TouchableOpacity
                  style={{ alignSelf: 'center', marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#334155' }}
                  onPress={() => handleSend('Help me pick a training plan')}
                >
                  <Text style={{ color: '#94a3b8', fontSize: 14 }}>Help me pick a training plan</Text>
                </TouchableOpacity>
              ) : null
            }
            contentContainerStyle={styles.messages}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Input */}
        <View style={styles.inputRow}>
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={handleAttachGpx}
            disabled={analyzingRoute || loading}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {analyzingRoute ? (
              <ActivityIndicator size="small" color="#60a5fa" />
            ) : (
              <Ionicons
                name="attach"
                size={24}
                color={analyzingRoute || loading ? '#475569' : '#94a3b8'}
              />
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask your coach anything..."
            placeholderTextColor="#475569"
            multiline
            maxLength={2000}
            returnKeyType="default"
            onFocus={() => {
              // When the keyboard opens, the FlatList shrinks but doesn't
              // auto-scroll — so the latest message ends up hidden behind
              // the keyboard. Force a scroll-to-end after the keyboard
              // animation has had a moment to start.
              setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 250);
            }}
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
    paddingTop: 12,
    paddingBottom: 24,
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
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
