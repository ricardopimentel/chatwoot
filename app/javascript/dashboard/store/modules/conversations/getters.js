import { MESSAGE_TYPE } from 'shared/constants/messages';
import { applyPageFilters, applyRoleFilter, sortComparator } from './helpers';
import filterQueryGenerator from 'dashboard/helper/filterQueryGenerator';
import { matchesFilters } from './helpers/filterHelpers';
import {
  getUserPermissions,
  getUserRole,
} from '../../../helper/permissionsHelper';
import camelcaseKeys from 'camelcase-keys';

export const getSelectedChatConversation = ({
  allConversations,
  selectedChatId,
}) =>
  allConversations.filter(conversation => conversation.id === selectedChatId);

const getters = {
    getAllConversations: ({ allConversations, chatSortFilter: sortKey }) => {
      return allConversations.sort((a, b) => sortComparator(a, b, sortKey));
    },
    getFilteredConversations: (
    { allConversations, chatSortFilter, appliedFilters },
    _,
    __,
    rootGetters
  ) => {
    console.log('--- 🚀 [DEBUG] INICIANDO getFilteredConversations ---');
    const currentUser = rootGetters.getCurrentUser;
    const currentUserId = rootGetters.getCurrentUser.id;
    const currentAccountId = rootGetters.getCurrentAccountId;
    const permissions = getUserPermissions(currentUser, currentAccountId);
    const userRole = getUserRole(currentUser, currentAccountId);
  
    return allConversations
      .filter(conversation => {
        // --- LOGS PARA CADA CONVERSA ---
        console.log(`\n\n--- Verificando Conversa ID: ${conversation.id} ---`);
  
        if (!conversation.meta) {
          console.log('Conversa REJEITADA: Sem objeto meta.');
          return false;
        }
  
        const { assignee, team } = conversation.meta;
  
        const isAssignedToMe = assignee && assignee.id === currentUserId;
        console.log(`- é Atribuída a Mim? (isAssignedToMe): ${isAssignedToMe}`);
  
        const isAssignedToMyTeam = team && team.is_member === true;
        console.log(`- é do Meu Time? (isAssignedToMyTeam): ${isAssignedToMyTeam}`);
  
        const isMineOrMyTeams = isAssignedToMe || isAssignedToMyTeam;
        console.log(`- é Minha OU do Meu Time? (isMineOrMyTeams): ${isMineOrMyTeams}`);
  
        const matchesFilterResult = matchesFilters(
          conversation,
          appliedFilters
        );
        console.log(`- Passa nos Filtros de Busca? (matchesFilterResult): ${matchesFilterResult}`);
  
        const allowedForRole = applyRoleFilter(
          conversation,
          userRole,
          permissions,
          currentUserId
        );
        console.log(`- É Permitida pela Regra de Permissão Padrão? (allowedForRole): ${allowedForRole}`);
  
        const finalDecision = matchesFilterResult && (isMineOrMyTeams || allowedForRole);
        console.log(`--- DECISÃO FINAL: Mostrar esta conversa? ${finalDecision} ---`);
  
        return finalDecision;
      })
      .sort((a, b) => sortComparator(a, b, chatSortFilter));
  },
  getSelectedChat: ({ selectedChatId, allConversations }) => {
    const selectedChat = allConversations.find(
      conversation => conversation.id === selectedChatId
    );
    return selectedChat || {};
  },
  getSelectedChatAttachments: ({ selectedChatId, attachments }) => {
    return attachments[selectedChatId] || [];
  },
  getChatListFilters: ({ conversationFilters }) => conversationFilters,
  getLastEmailInSelectedChat: (stage, _getters) => {
    const selectedChat = _getters.getSelectedChat;
    const { messages = [] } = selectedChat;
    const lastEmail = [...messages].reverse().find(message => {
      const { message_type: messageType } = message;
      if (message.private) return false;

      return [MESSAGE_TYPE.OUTGOING, MESSAGE_TYPE.INCOMING].includes(
        messageType
      );
    });

    return lastEmail;
  },
  getMineChats: (_state, _, __, rootGetters) => activeFilters => {
  const currentUserID = rootGetters.getCurrentUser?.id;

  // Filtra todas as conversas
  return _state.allConversations.filter(conversation => {
    // Se conversation.meta não existir, ignora a conversa para evitar erros.
    if (!conversation.meta) {
      console.log(`Não tenho os meta`);
      return false;
    }

    const { assignee, team } = conversation.meta;

    // Condição A: A conversa está atribuída diretamente a mim?
    const isAssignedToMe = assignee && assignee.id === currentUserID;

    // Condição B: A conversa pertence a um time do qual sou membro?
    // A verificação 'team &&' é CRUCIAL. Ela garante que só tentaremos
    // ler 'team.is_member' se a variável 'team' não for undefined.
    const isAssignedToMyTeam = team && team.is_member === true;

    // Condição C: A conversa passa nos outros filtros da página?
    const shouldFilter = applyPageFilters(conversation, activeFilters);

    // Resultado: A conversa é "Minha" se (A ou B) e C forem verdadeiras.
    return (isAssignedToMe || isAssignedToMyTeam) && shouldFilter;
  });
},
  getAppliedConversationFiltersV2: _state => {
    // TODO: Replace existing one with V2 after migrating the filters to use camelcase
    return _state.appliedFilters.map(camelcaseKeys);
  },
  getAppliedConversationFilters: _state => {
    return _state.appliedFilters;
  },
  getAppliedConversationFiltersQuery: _state => {
    const hasAppliedFilters = _state.appliedFilters.length !== 0;
    return hasAppliedFilters ? filterQueryGenerator(_state.appliedFilters) : [];
  },
  getUnAssignedChats: _state => activeFilters => {
    return _state.allConversations.filter(conversation => {
      const isUnAssigned = !conversation.meta.assignee;
      const shouldFilter = applyPageFilters(conversation, activeFilters);
      return isUnAssigned && shouldFilter;
    });
  },
  getAllStatusChats: (_state, _, __, rootGetters) => activeFilters => {
    const currentUser = rootGetters.getCurrentUser;
    const currentUserId = rootGetters.getCurrentUser.id;
    const currentAccountId = rootGetters.getCurrentAccountId;

    const permissions = getUserPermissions(currentUser, currentAccountId);
    const userRole = getUserRole(currentUser, currentAccountId);

    return _state.allConversations.filter(conversation => {
      const shouldFilter = applyPageFilters(conversation, activeFilters);
      const allowedForRole = applyRoleFilter(
        conversation,
        userRole,
        permissions,
        currentUserId
      );

      return shouldFilter && allowedForRole;
    });
  },
  getChatListLoadingStatus: ({ listLoadingStatus }) => listLoadingStatus,
  getAllMessagesLoaded(_state) {
    const [chat] = getSelectedChatConversation(_state);
    return !chat || chat.allMessagesLoaded === undefined
      ? false
      : chat.allMessagesLoaded;
  },
  getUnreadCount(_state) {
    const [chat] = getSelectedChatConversation(_state);
    if (!chat) return [];
    return chat.messages.filter(
      chatMessage =>
        chatMessage.created_at * 1000 > chat.agent_last_seen_at * 1000 &&
        chatMessage.message_type === 0 &&
        chatMessage.private !== true
    ).length;
  },
  getChatStatusFilter: ({ chatStatusFilter }) => chatStatusFilter,
  getChatSortFilter: ({ chatSortFilter }) => chatSortFilter,
  getSelectedInbox: ({ currentInbox }) => currentInbox,
  getConversationById: _state => conversationId => {
    return _state.allConversations.find(
      value => value.id === Number(conversationId)
    );
  },
  getConversationParticipants: _state => {
    return _state.conversationParticipants;
  },
  getConversationLastSeen: _state => {
    return _state.conversationLastSeen;
  },

  getContextMenuChatId: _state => {
    return _state.contextMenuChatId;
  },

  getCopilotAssistant: _state => {
    return _state.copilotAssistant;
  },
};

export default getters;
