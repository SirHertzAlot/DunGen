export interface Region {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: string;
  serverNode: string;
}

export interface Player {
  id: string;
  username: string;
  level: number;
  experience: number;
  health: number;
  mana: number;
  regionId: string;
  isOnline: boolean;
  lastActive: string;
}

export interface SystemStats {
  totalPlayers: number;
  onlinePlayers: number;
  totalRegions: number;
  activeRegions: number;
  uptime: number;
  eventProcessed: number;
}
