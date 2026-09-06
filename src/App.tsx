import React, { useCallback, useEffect, useRef, useState } from "react";
import Home from "./screens/Home";
import Creator from "./screens/Creator";
import Lobby from "./screens/Lobby";
import Fight from "./screens/Fight";
import ProfileScreen from "./screens/Profile";
import SettingsScreen from "./screens/Settings";
import { Profile, Settings, loadProfile, loadSettings, onlineCount, saveProfile, saveSettings } from "./store";
import { MatchSession } from "./net/peer";
import { initAudio, setVolumes, startMusic } from "./audio/sfx";

type Screen = "home" | "creator" | "lobby" | "fight" | "training" | "profile" | "settings";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [session, setSession] = useState<MatchSession | null>(null);
  const [online, setOnline] = useState(() => onlineCount());
  const audioReady = useRef(false);

  /* audio unlocks on first user gesture */
  useEffect(() => {
    const unlock = () => {
      if (audioReady.current) return;
      audioReady.current = true;
      initAudio();
      setVolumes(settings.sfx, settings.music, settings.muted);
      startMusic();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* live online counter drift */
  useEffect(() => {
    const id = setInterval(() => setOnline(onlineCount()), 4000);
    return () => clearInterval(id);
  }, []);

  const updateProfile = useCallback((p: Profile) => {
    setProfile(p);
    saveProfile(p);
  }, []);
  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
    setVolumes(s.sfx, s.music, s.muted);
  }, []);

  const nav = (s: Screen) => setScreen(s);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      {screen === "home" && <Home profile={profile} online={online} onNav={(s) => nav(s as Screen)} />}

      {screen === "creator" && (
        <Creator
          initial={profile.fighter}
          onSave={(fighter) => updateProfile({ ...profile, fighter, name: profile.name })}
          onBack={() => nav("home")}
        />
      )}

      {screen === "lobby" && (
        <Lobby
          profile={profile}
          online={online}
          onBack={() => nav("home")}
          onMatched={(s) => { setSession(s); setScreen("fight"); }}
        />
      )}

      {(screen === "fight" || screen === "training") && (
        <Fight
          mode={screen === "training" ? "training" : "online"}
          session={screen === "training" ? null : session}
          profile={profile}
          settings={settings}
          onProfileChange={updateProfile}
          onExit={() => { setSession(null); setScreen(screen === "training" ? "home" : "lobby"); }}
        />
      )}

      {screen === "profile" && (
        <ProfileScreen profile={profile} onBack={() => nav("home")} onEdit={() => nav("creator")} />
      )}

      {screen === "settings" && (
        <SettingsScreen settings={settings} onChange={updateSettings} onBack={() => nav("home")} />
      )}
    </div>
  );
}
