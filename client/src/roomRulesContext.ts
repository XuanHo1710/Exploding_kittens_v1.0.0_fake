import { createContext, useContext } from 'react';
import { DEFAULT_ROOM_RULES, type RoomRules } from '../../shared/src';

/** Share the agreed room rules with floating card previews as well as the table. */
export const RoomRulesContext = createContext<RoomRules>(DEFAULT_ROOM_RULES);
export const RoomPlayerCountContext = createContext<number | undefined>(undefined);
export const useRoomRules = () => useContext(RoomRulesContext);
export const useRoomPlayerCount = () => useContext(RoomPlayerCountContext);
