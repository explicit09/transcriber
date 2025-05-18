import React, { useEffect, useState } from "react";
import { WebsocketProvider } from "y-websocket";

interface PresenceUser {
  name: string;
  color: string;
}

interface PresenceListProps {
  provider: WebsocketProvider;
}

export default function PresenceList({ provider }: PresenceListProps) {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;

    const update = () => {
      const states = Array.from(awareness.getStates().values());
      const list: PresenceUser[] = [];
      states.forEach((state: any) => {
        if (state.user) list.push(state.user as PresenceUser);
      });
      setUsers(list);
    };

    update();
    awareness.on("change", update);
    return () => {
      awareness.off("change", update);
    };
  }, [provider]);

  if (users.length === 0) return null;

  return (
    <div className="flex gap-2 mb-2 text-xs">
      {users.map((u, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: u.color }}
          />
          <span>{u.name}</span>
        </div>
      ))}
    </div>
  );
}
