import type { DatabaseSync } from 'node:sqlite';
import { createCardExtras } from './store/card-extras.js';
import { createHouse } from './store/house.js';
import { createTemplates } from './store/templates.js';
import { createFairness } from './store/fairness.js';
import { createCards } from './store/cards.js';
import { createBoards } from './store/boards.js';
import { createCompletion } from './store/completion.js';
import { createContext } from './store/context.js';
import type { Internals } from './store/internals.js';
import { createNotifications } from './store/notifications.js';
import { createNudgesPart } from './store/nudges.js';
import { createPeople } from './store/people.js';
import { createTrash } from './store/trash.js';
import type { StoreOptions } from './store/types.js';
import { createWatcherCards } from './store/watchers.js';

// Alles, was nach außen sichtbar ist (Typen, Konstanten wie NUDGE_TEMPLATES), steht weiter unter ./store.js
export * from './store/types.js';

/**
 * Der Store: alle Daten in SQLite. Seit 1.12.0 in Teile nach Themen aufgeteilt (store/*.ts); dieses Objekt setzt sie zusammen
 * und bietet nach außen genau dieselben Methoden wie vorher (test/shape.test.ts hält das fest).
 */
export function createStore(db: DatabaseSync, opts: StoreOptions = {}) {
  const c = createContext(db, opts);
  const s = {} as Internals;
  // Die Teile rufen einander über s auf; zusammengesetzt wird, bevor die erste Methode benutzt werden kann
  Object.assign(
    s,
    createPeople(c, s),
    createBoards(c, s),
    createCards(c, s),
    createCardExtras(c, s),
    createCompletion(c, s),
    createNotifications(c),
    createNudgesPart(c, s),
    createWatcherCards(c, s),
    createTrash(c, s),
    createHouse(c, s),
    createTemplates(c, s),
    createFairness(c, s),
  );

  return {
    createNudges: s.createNudges,
    nudgeTargets: s.nudgeTargets,
    dueNudges: s.dueNudges,
    claimNudge: s.claimNudge,
    releaseNudge: s.releaseNudge,
    replyNudge: s.replyNudge,
    getNudge: s.getNudge,
    nudgeRecipients: s.nudgeRecipients,
    openNudgeCounts: s.openNudgeCounts,
    openNudgeList: s.openNudgeList,
    recentNudges: s.recentNudges,
    setNudgeQuiet: s.setNudgeQuiet,
    syncPeople: s.syncPeople,
    resolveUser: s.resolveUser,
    people: s.people,
    pendingUsers: s.pendingUsers,
    addPerson: s.addPerson,
    removePerson: s.removePerson,
    renamePerson: s.renamePerson,
    setNotifyServices: s.setNotifyServices,
    ntfyTopic: s.ntfyTopic,
    setNtfyTopic: s.setNtfyTopic,
    languageOf: s.languageOf,
    setLanguage: s.setLanguage,
    setAccentHue: s.setAccentHue,
    setWeeklySummary: s.setWeeklySummary,
    pushSecret: s.pushSecret,
    rawSetting: s.rawSetting,
    putRawSetting: s.putRawSetting,
    getAccessMode: s.getAccessMode,
    setAccessMode: s.setAccessMode,
    importLegacyPeople: s.importLegacyPeople,
    transaction: c.tx,
    takeChanges: c.takeChanges,
    markAllChanged: c.markAllChanged,
    setCardOrigin: s.setCardOrigin,
    openCardOfWatcher: s.openCardOfWatcher,
    watcherCardCompletedSince: s.watcherCardCompletedSince,
    openWatcherCardCount: s.openWatcherCardCount,
    openCardByDedupeKey: s.openCardByDedupeKey,
    applyManagedPeople: s.applyManagedPeople,
    isManaged: s.isManaged,
    clearManaged: s.clearManaged,
    userByHaId: s.userByHaId,
    userById: s.userById,
    addAttachment: s.addAttachment,
    getAttachment: s.getAttachment,
    deleteAttachment: s.deleteAttachment,
    referencedFiles: s.referencedFiles,
    addComment: s.addComment,
    listComments: s.listComments,
    updateComment: s.updateComment,
    deleteComment: s.deleteComment,
    getSettings: s.getSettings,
    setSettings: s.setSettings,
    openDueCards: s.openDueCards,
    claimNotification: s.claimNotification,
    releaseNotification: s.releaseNotification,
    recentNotifications: s.recentNotifications,
    createBoard: s.createBoard,
    listBoards: s.listBoards,
    getBoardView: s.getBoardView,
    updateBoard: s.updateBoard,
    deleteBoard: s.deleteBoard,
    addColumn: s.addColumn,
    updateColumn: s.updateColumn,
    moveColumn: s.moveColumn,
    deleteColumn: s.deleteColumn,
    syncPlanned: s.syncPlanned,
    ensurePlannedColumns: s.ensurePlannedColumns,
    addCategory: s.addCategory,
    updateCategory: s.updateCategory,
    deleteCategory: s.deleteCategory,
    createCard: s.createCard,
    getCard: s.getCard,
    getCards: s.getCards,
    updateCard: s.updateCard,
    moveCard: s.moveCard,
    completeCard: s.completeCard,
    duplicateCard: s.duplicateCard,
    undoCompletion: s.undoCompletion,
    listCompletions: s.listCompletions,
    archiveDone: s.archiveDone,
    restoreArchived: s.restoreArchived,
    deleteCard: s.deleteCard,
    setArchived: s.setArchived,
    listArchived: s.listArchived,
    listSchedule: s.listSchedule,
    addChecklistItem: s.addChecklistItem,
    updateChecklistItem: s.updateChecklistItem,
    deleteChecklistItem: s.deleteChecklistItem,
    addLink: s.addLink,
    updateLink: s.updateLink,
    listShortMapsLinks: s.listShortMapsLinks,
    deleteLink: s.deleteLink,
    listTrash: s.listTrash,
    restoreFromTrash: s.restoreFromTrash,
    purgeTrash: s.purgeTrash,
    ensureDefaultBoard: s.ensureDefaultBoard,
    fairness: s.fairness,
    listTemplates: s.listTemplates,
    getTemplateData: s.getTemplateData,
    createBoardFromTemplate: s.createBoardFromTemplate,
    saveBoardAsTemplate: s.saveBoardAsTemplate,
    deleteTemplate: s.deleteTemplate,
    houseChannels: s.houseChannels,
    houseChannelsOf: s.houseChannelsOf,
    houseChannel: s.houseChannel,
    addHouseChannel: s.addHouseChannel,
    updateHouseChannel: s.updateHouseChannel,
    removeHouseChannel: s.removeHouseChannel,
    addHousePending: s.addHousePending,
    housePendingOf: s.housePendingOf,
    housePendingAll: s.housePendingAll,
    removeHousePending: s.removeHousePending,
    purgeHousePending: s.purgeHousePending,
    getHouseTts: s.getHouseTts,
    setHouseTts: s.setHouseTts,
  };
}

export type Store = ReturnType<typeof createStore>;
