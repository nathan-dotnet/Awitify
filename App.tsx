import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Keyboard, Pressable, SafeAreaView, ScrollView, StatusBar, Text, TextInput, View, Image, ActivityIndicator } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Audio, useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { Ionicons } from '@expo/vector-icons';
import { C } from './src/theme';
import { Track, TabName } from './src/types';

const dbPromise = SQLite.openDatabaseAsync('awitify.db');
const fmt = (seconds = 0) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const initials = (title: string) => title.trim().slice(0, 1).toUpperCase() || '♪';

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tab, setTab] = useState<TabName>('Home');
  const [query, setQuery] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [expandedQueue, setExpandedQueue] = useState(false);

  const current = tracks.find(t => t.id === currentId) ?? null;
  const player = useAudioPlayer(current?.uri ? { uri: current.uri } : null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
        const db = await dbPromise;
        await db.execAsync(`CREATE TABLE IF NOT EXISTS tracks (
          id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, artist TEXT NOT NULL, album TEXT NOT NULL,
          uri TEXT NOT NULL, duration REAL, liked INTEGER NOT NULL DEFAULT 0, addedAt INTEGER NOT NULL
        );`);
        const rows = await db.getAllAsync<any>('SELECT * FROM tracks ORDER BY addedAt DESC');
        setTracks(rows.map(r => ({ ...r, liked: !!r.liked })));
      } catch (e) { console.warn('Awitify initialization', e); }
    })();
  }, []);

  useEffect(() => {
    if (!current) return;
    try {
      player.setActiveForLockScreen(true, { title: current.title, artist: current.artist, albumTitle: current.album || 'Awitify' });
    } catch (e) { console.warn('Lock-screen controls are not available in this build', e); }
    return () => { try { player.clearLockScreenControls(); } catch {} };
  }, [currentId]);

  const playTrack = useCallback(async (track: Track, list = tracks) => {
    const listIds = list.map(t => t.id);
    setQueue(listIds);
    setQueueIndex(Math.max(0, listIds.indexOf(track.id)));
    if (currentId === track.id) {
      if (status.playing) player.pause(); else player.play();
      setShowPlayer(true);
      return;
    }
    setCurrentId(track.id);
    setShowPlayer(true);
    // The player source is replaced after React applies the selected track.
    setTimeout(() => { try { player.replace({ uri: track.uri }); player.play(); } catch (e) { console.warn(e); } }, 80);
  }, [tracks, currentId, status.playing, player]);

  const playNext = useCallback((direction: number) => {
    if (!queue.length) return;
    const nextIndex = (queueIndex + direction + queue.length) % queue.length;
    const next = tracks.find(t => t.id === queue[nextIndex]);
    if (next) { setQueueIndex(nextIndex); setCurrentId(next.id); setShowPlayer(true); try { player.replace({ uri: next.uri }); player.play(); } catch {} }
  }, [queue, queueIndex, tracks, player]);

  useEffect(() => {
    if (status.didJustFinish) playNext(1);
  }, [status.didJustFinish, playNext]);

  const importMusic = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], multiple: true, copyToCacheDirectory: true });
      if (result.canceled) return;
      setBusy(true);
      const db = await dbPromise;
      const directory = `${FileSystem.documentDirectory}music/`;
      const dirInfo = await FileSystem.getInfoAsync(directory);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const added: Track[] = [];
      for (const asset of result.assets) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const safeName = (asset.name || `track-${id}`).replace(/[^a-zA-Z0-9._ -]/g, '_');
        const destination = `${directory}${id}-${safeName}`;
        await FileSystem.copyAsync({ from: asset.uri, to: destination });
        const raw = safeName.replace(/\.[^.]+$/, '');
        const track: Track = { id, title: raw, artist: 'Unknown artist', album: 'Local files', uri: destination, liked: false, addedAt: Date.now() };
        await db.runAsync('INSERT INTO tracks (id,title,artist,album,uri,duration,liked,addedAt) VALUES (?,?,?,?,?,?,?,?)', track.id, track.title, track.artist, track.album, track.uri, null, 0, track.addedAt);
        added.push(track);
      }
      setTracks(old => [...added.reverse(), ...old]);
      if (added.length) Alert.alert('Added to Awitify', `${added.length} ${added.length === 1 ? 'song' : 'songs'} imported to your offline library.`);
    } catch (e) {
      console.error(e); Alert.alert('Import failed', 'Awitify could not import one or more audio files. Please try again.');
    } finally { setBusy(false); }
  };

  const toggleLike = async (track: Track) => {
    const liked = !track.liked;
    setTracks(old => old.map(t => t.id === track.id ? { ...t, liked } : t));
    const db = await dbPromise;
    await db.runAsync('UPDATE tracks SET liked=? WHERE id=?', liked ? 1 : 0, track.id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (tab === 'Library') return tracks;
    if (tab === 'Search' && q) return tracks.filter(t => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
    return tracks;
  }, [tracks, query, tab]);

  const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => <View style={{ marginBottom: 22 }}><Text style={styles.eyebrow}>AWITIFY</Text><Text style={styles.heading}>{title}</Text>{subtitle ? <Text style={styles.subheading}>{subtitle}</Text> : null}</View>;

  const TrackRow = ({ item, index, list }: { item: Track; index: number; list: Track[] }) => (
    <Pressable onPress={() => playTrack(item, list)} style={({ pressed }) => [styles.trackRow, pressed && { opacity: 0.7 }]}>
      <View style={[styles.coverSmall, currentId === item.id && styles.coverPlaying]}><Text style={styles.coverLetter}>{initials(item.title)}</Text></View>
      <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={[styles.trackTitle, currentId === item.id && { color: C.blue }]}>{item.title}</Text><Text numberOfLines={1} style={styles.trackMeta}>{item.artist} · {item.album}</Text></View>
      <Pressable hitSlop={10} onPress={() => toggleLike(item)} style={{ padding: 8 }}><Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={20} color={item.liked ? C.blue : C.muted} /></Pressable>
      <Pressable hitSlop={10} onPress={() => { Alert.alert(item.title, 'Song options', [{ text: 'Play next', onPress: () => { const next = [...queue]; const at = Math.max(0, next.indexOf(currentId || '')); next.splice(at + 1, 0, item.id); setQueue(next); } }, { text: 'Cancel', style: 'cancel' }]); }} style={{ padding: 5 }}><Ionicons name="ellipsis-vertical" size={18} color={C.muted} /></Pressable>
    </Pressable>
  );

  const Empty = ({ title, detail, action }: { title: string; detail: string; action?: boolean }) => <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="musical-notes" size={28} color={C.blue} /></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{detail}</Text>{action && <Pressable onPress={importMusic} style={styles.primaryButton}><Ionicons name="add" size={19} color={C.white} /><Text style={styles.primaryButtonText}>Import music</Text></Pressable>}</View>;

  const renderContent = () => {
    if (tab === 'Home') return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
      <View style={styles.topBar}><View><Text style={styles.eyebrow}>YOUR MUSIC. YOUR WAY.</Text><Text style={styles.heading}>Good afternoon</Text></View><View style={styles.avatar}><Ionicons name="musical-note" size={21} color={C.white} /></View></View>
      <Pressable style={styles.hero} onPress={importMusic}><View style={styles.heroGlow} /><View style={{ flex: 1 }}><Text style={styles.heroLabel}>YOUR OFFLINE PLAYER</Text><Text style={styles.heroTitle}>All your songs.{"\n"}One place.</Text><Text style={styles.heroDesc}>Your music stays on your device.</Text><View style={styles.heroButton}><Ionicons name="add" size={17} color={C.white} /><Text style={styles.heroButtonText}>Import music</Text></View></View><View style={styles.heroArt}><Ionicons name="musical-notes" size={52} color={C.white} /><View style={styles.artDot} /></View></Pressable>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Recently added</Text><Pressable onPress={() => setTab('Library')}><Text style={styles.link}>See all</Text></Pressable></View>
      {tracks.length ? tracks.slice(0, 5).map((t, i) => <TrackRow key={t.id} item={t} index={i} list={tracks} />) : <Empty title="Your library starts here" detail="Import audio files stored on your phone to start listening offline." action />}
      {tracks.length > 0 && <Pressable onPress={() => playTrack(tracks[0], tracks)} style={styles.shuffleButton}><Ionicons name="shuffle" size={19} color={C.white} /><Text style={styles.shuffleText}>Shuffle your music</Text></Pressable>}
    </ScrollView>;
    if (tab === 'Search') return <View style={{ flex: 1 }}><Header title="Search" subtitle="Find a song in your local library." /><View style={styles.searchBox}><Ionicons name="search" size={20} color={C.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="Songs, artists, albums" placeholderTextColor={C.dim} style={styles.searchInput} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} /><Pressable onPress={() => setQuery('')}><Ionicons name="close-circle" size={18} color={C.dim} /></Pressable></View>{query.trim() ? <FlatList keyboardShouldPersistTaps="handled" data={filtered} keyExtractor={i => i.id} renderItem={({ item, index }) => <TrackRow item={item} index={index} list={filtered} />} ListEmptyComponent={<Empty title="No matches" detail="Try another song, artist, or album name." />} /> : <Empty title="Search your music" detail="Search only includes audio files you have imported." />}</View>;
    if (tab === 'Library') return <View style={{ flex: 1 }}><Header title="Your library" subtitle={`${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'} stored on this device`} /><View style={styles.libraryActions}><Pressable onPress={importMusic} style={styles.outlineButton}><Ionicons name="add" size={18} color={C.white} /><Text style={styles.outlineText}>Add music</Text></Pressable><Pressable onPress={() => tracks.length && playTrack(tracks[0], tracks)} style={styles.outlineButton}><Ionicons name="play" size={16} color={C.white} /><Text style={styles.outlineText}>Play all</Text></Pressable></View>{tracks.length ? <FlatList data={tracks} keyExtractor={i => i.id} renderItem={({ item, index }) => <TrackRow item={item} index={index} list={tracks} />} contentContainerStyle={{ paddingBottom: 150 }} /> : <Empty title="Nothing here yet" detail="Import your MP3 or other supported audio files. No account needed." action />}</View>;
    return <ScrollView contentContainerStyle={{ paddingBottom: 140 }}><Header title="Settings" subtitle="Make Awitify yours." /><View style={styles.settingsCard}><View style={styles.settingIcon}><Ionicons name="phone-portrait-outline" size={21} color={C.blue} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Offline music</Text><Text style={styles.settingText}>Your imported files stay on this device. Awitify does not stream music or require an account.</Text></View></View><View style={styles.settingsCard}><View style={styles.settingIcon}><Ionicons name="headset-outline" size={21} color={C.blue} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Background playback</Text><Text style={styles.settingText}>Designed to keep playing when you switch apps or lock your screen. Use an Android development/production build to test native playback controls.</Text></View></View><View style={styles.settingsCard}><View style={styles.settingIcon}><Ionicons name="color-palette-outline" size={21} color={C.blue} /></View><View style={{ flex: 1 }}><Text style={styles.settingTitle}>Awitify theme</Text><Text style={styles.settingText}>Midnight charcoal, electric blue, and clean white.</Text><View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>{[C.blue, C.blue2, C.bg, C.white, C.muted].map(color => <View key={color} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, borderWidth: color === C.white ? 1 : 0, borderColor: C.dim }} />)}</View></View></View><Text style={styles.version}>AWITIFY · VERSION 1.0.0</Text></ScrollView>;
  };

  return <SafeAreaView style={styles.safe}><ExpoStatusBar style="light" backgroundColor={C.bg} /><StatusBar barStyle="light-content" backgroundColor={C.bg} /><View style={styles.app}>{renderContent()}</View>
    {current && <View style={styles.bottomPlayer}><Pressable onPress={() => setShowPlayer(true)} style={styles.miniInfo}><View style={styles.miniCover}><Ionicons name="musical-note" size={19} color={C.white} /></View><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.miniTitle}>{current.title}</Text><Text numberOfLines={1} style={styles.miniArtist}>{current.artist}</Text></View></Pressable><Pressable onPress={() => playNext(-1)} style={styles.miniControl}><Ionicons name="play-skip-back" size={21} color={C.white} /></Pressable><Pressable onPress={() => status.playing ? player.pause() : player.play()} style={styles.miniControl}><Ionicons name={status.playing ? 'pause' : 'play'} size={25} color={C.white} /></Pressable><Pressable onPress={() => playNext(1)} style={styles.miniControl}><Ionicons name="play-skip-forward" size={21} color={C.white} /></Pressable><View style={[styles.progress, { width: `${status.duration ? Math.min(100, status.currentTime / status.duration * 100) : 0}%` }]} /></View>}
    <View style={styles.tabBar}>{([['Home','home'],['Search','search'],['Library','library'],['Settings','settings']] as [TabName,string][]).map(([name, icon]) => <Pressable key={name} onPress={() => setTab(name)} style={styles.tabItem}><Ionicons name={(tab === name ? `${icon}` : `${icon}-outline`) as any} size={22} color={tab === name ? C.blue : C.muted} /><Text style={[styles.tabText, tab === name && { color: C.blue }]}>{name}</Text></Pressable>)}</View>
    {showPlayer && current && <View style={styles.fullOverlay}><View style={styles.playerHeader}><Pressable onPress={() => setShowPlayer(false)} style={styles.playerClose}><Ionicons name="chevron-down" size={25} color={C.white} /></Pressable><View style={{ alignItems: 'center' }}><Text style={styles.playerEyebrow}>NOW PLAYING</Text><Text style={styles.playerHeaderTitle}>From your library</Text></View><Pressable onPress={() => setExpandedQueue(!expandedQueue)} style={styles.playerClose}><Ionicons name="list" size={24} color={C.white} /></Pressable></View>
      <View style={styles.bigCover}><View style={styles.bigCoverInner}><Ionicons name="musical-notes" size={86} color={C.white} /></View><View style={styles.bigCoverRing} /></View>
      <View style={styles.nowPlayingInfo}><View style={{ flex: 1 }}><Text numberOfLines={2} style={styles.nowTitle}>{current.title}</Text><Text style={styles.nowArtist}>{current.artist}</Text></View><Pressable onPress={() => toggleLike(current)}><Ionicons name={current.liked ? 'heart' : 'heart-outline'} size={27} color={current.liked ? C.blue : C.muted} /></Pressable></View>
      <View style={styles.seekWrap}><View style={styles.seekTrack}><View style={[styles.seekFill, { width: `${status.duration ? Math.min(100, status.currentTime / status.duration * 100) : 0}%` }]} /></View><View style={styles.seekLabels}><Text style={styles.seekTime}>{fmt(status.currentTime)}</Text><Text style={styles.seekTime}>{fmt(status.duration)}</Text></View></View>
      <View style={styles.mainControls}><Pressable onPress={() => playNext(-1)}><Ionicons name="play-skip-back" size={32} color={C.white} /></Pressable><Pressable onPress={() => status.playing ? player.pause() : player.play()} style={styles.playButton}><Ionicons name={status.playing ? 'pause' : 'play'} size={34} color={C.white} /></Pressable><Pressable onPress={() => playNext(1)}><Ionicons name="play-skip-forward" size={32} color={C.white} /></Pressable></View>
      {expandedQueue && <View style={styles.queuePanel}><Text style={styles.sectionTitle}>Up next</Text>{queue.map(id => tracks.find(t => t.id === id)).filter(Boolean).slice(0, 4).map(t => <Text key={t!.id} numberOfLines={1} style={[styles.queueText, t!.id === current.id && { color: C.blue }]}>{t!.title}</Text>)}</View>}
      <View style={styles.playerFooter}><Ionicons name="phone-portrait-outline" size={17} color={C.muted} /><Text style={styles.playerFooterText}>Playing from this device</Text><View style={{ flex: 1 }} /><Pressable onPress={() => setExpandedQueue(!expandedQueue)}><Ionicons name="list" size={22} color={C.muted} /></Pressable></View>
    </View>}
    {busy && <View style={styles.busyOverlay}><ActivityIndicator color={C.white} size="large" /><Text style={{ color: C.white, marginTop: 12 }}>Importing your music…</Text></View>}
  </SafeAreaView>;
}

const styles: any = {
  safe: { flex: 1, backgroundColor: C.bg }, app: { flex: 1, paddingHorizontal: 20, paddingTop: 16 }, topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }, eyebrow: { color: C.blue, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 7 }, heading: { color: C.text, fontSize: 29, fontWeight: '800', letterSpacing: -0.8 }, subheading: { color: C.muted, fontSize: 13, marginTop: 7 }, avatar: { width: 43, height: 43, borderRadius: 15, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  hero: { minHeight: 200, borderRadius: 25, padding: 21, overflow: 'hidden', backgroundColor: C.blue, flexDirection: 'row', alignItems: 'center', marginBottom: 28 }, heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -80, backgroundColor: '#4989E6', opacity: 0.65 }, heroLabel: { color: '#DCEAFF', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 }, heroTitle: { color: C.white, fontSize: 26, lineHeight: 30, fontWeight: '900', letterSpacing: -0.7 }, heroDesc: { color: '#E0EBFF', fontSize: 11, marginTop: 9 }, heroButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#174E9E', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, marginTop: 15 }, heroButtonText: { color: C.white, fontSize: 11, fontWeight: '700' }, heroArt: { width: 90, height: 115, marginLeft: 3, borderRadius: 22, backgroundColor: '#1E31D7', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '7deg' }] }, artDot: { position: 'absolute', width: 13, height: 13, borderRadius: 7, backgroundColor: '#72A8F7', right: 12, top: 13 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, sectionTitle: { color: C.text, fontSize: 17, fontWeight: '800' }, link: { color: '#6BA3F6', fontSize: 12, fontWeight: '700' }, trackRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 }, coverSmall: { width: 47, height: 47, borderRadius: 11, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }, coverPlaying: { backgroundColor: '#183D76', borderColor: C.blue }, coverLetter: { color: C.white, fontSize: 19, fontWeight: '800' }, trackTitle: { color: C.text, fontSize: 13, fontWeight: '700' }, trackMeta: { color: C.muted, fontSize: 11, marginTop: 4 }, shuffleButton: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, padding: 15, marginTop: 16 }, shuffleText: { color: C.white, fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25, paddingVertical: 35 }, emptyIcon: { width: 65, height: 65, borderRadius: 22, backgroundColor: '#1A2B48', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, emptyTitle: { color: C.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }, emptyText: { color: C.muted, fontSize: 12, textAlign: 'center', lineHeight: 19, marginTop: 8, maxWidth: 270 }, primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.blue, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 22, marginTop: 20 }, primaryButtonText: { color: C.white, fontSize: 12, fontWeight: '800' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, height: 52, marginBottom: 17 }, searchInput: { color: C.white, fontSize: 13, flex: 1 }, libraryActions: { flexDirection: 'row', gap: 10, marginBottom: 14 }, outlineButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderColor: C.border, borderWidth: 1, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 14 }, outlineText: { color: C.white, fontSize: 12, fontWeight: '700' },
  settingsCard: { flexDirection: 'row', gap: 13, padding: 16, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, marginBottom: 12 }, settingIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#1B2D4A', alignItems: 'center', justifyContent: 'center' }, settingTitle: { color: C.text, fontSize: 13, fontWeight: '800', marginTop: 2 }, settingText: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 5 }, version: { color: C.dim, textAlign: 'center', fontSize: 9, letterSpacing: 2, marginTop: 18 },
  bottomPlayer: { position: 'absolute', left: 10, right: 10, bottom: 68, height: 63, borderRadius: 16, backgroundColor: '#22232C', borderWidth: 1, borderColor: '#3C3C4A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, zIndex: 5, overflow: 'hidden' }, miniInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 }, miniCover: { width: 40, height: 40, borderRadius: 9, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }, miniTitle: { color: C.white, fontSize: 11, fontWeight: '800' }, miniArtist: { color: C.muted, fontSize: 10, marginTop: 3 }, miniControl: { width: 35, height: 44, alignItems: 'center', justifyContent: 'center' }, progress: { position: 'absolute', height: 2, backgroundColor: C.blue, left: 0, bottom: 0 }, tabBar: { height: 66, backgroundColor: C.bg, borderTopColor: C.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingBottom: 3 }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }, tabText: { color: C.muted, fontSize: 9, fontWeight: '700' },
  fullOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 20, backgroundColor: C.bg, paddingHorizontal: 25, paddingTop: 48, paddingBottom: 30 }, playerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, playerClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, playerEyebrow: { color: C.muted, fontSize: 9, letterSpacing: 2, fontWeight: '800' }, playerHeaderTitle: { color: C.white, fontSize: 12, fontWeight: '700', marginTop: 4 }, bigCover: { width: '100%', aspectRatio: 1, maxHeight: 310, marginTop: 32, alignSelf: 'center', borderRadius: 28, backgroundColor: '#1E6BD7', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, bigCoverInner: { width: '80%', height: '80%', borderRadius: 25, backgroundColor: '#1E31D7', alignItems: 'center', justifyContent: 'center' }, bigCoverRing: { position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 1, borderColor: '#FFFFFF25' }, nowPlayingInfo: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 28 }, nowTitle: { color: C.white, fontSize: 23, fontWeight: '900', letterSpacing: -0.5 }, nowArtist: { color: C.muted, fontSize: 13, marginTop: 6 }, seekWrap: { marginTop: 28 }, seekTrack: { height: 4, backgroundColor: C.surface2, borderRadius: 4, overflow: 'hidden' }, seekFill: { height: 4, backgroundColor: C.white, borderRadius: 4 }, seekLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, seekTime: { color: C.muted, fontSize: 10 }, mainControls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginTop: 24 }, playButton: { width: 65, height: 65, borderRadius: 33, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }, playerFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 'auto' }, playerFooterText: { color: C.muted, fontSize: 11 }, queuePanel: { backgroundColor: C.surface, borderRadius: 15, padding: 14, marginTop: 18 }, queueText: { color: C.muted, fontSize: 12, marginTop: 8 }, busyOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 40, backgroundColor: '#000000BB', alignItems: 'center', justifyContent: 'center' }
};
