// Netcat 协议测试工具 - 主入口

import { Loader2 } from "lucide-react";
import { useNetcat } from "./hooks/useNetcat";
import SessionList from "./components/SessionList";
import CreateSessionForm from "./components/CreateSessionForm";
import SessionToolbar from "./components/SessionToolbar";
import StatsBar from "./components/StatsBar";
import ClientList from "./components/ClientList";
import MessageList from "./components/MessageList";
import SendArea from "./components/SendArea";
import EmptyState from "./components/EmptyState";

export default function NetcatTool() {
  const nc = useNetcat();

  if (!nc.initialized) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="animate-spin" size={24} />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-gray-50 dark:bg-gray-900">
      {/* 左侧会话列表 */}
      <SessionList
        sessions={nc.sessions}
        selectedSessionId={nc.selectedSessionId}
        onSelectSession={nc.setSelectedSessionId}
        onCreateSession={() => nc.setShowCreateForm(true)}
      />

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col">
        {nc.showCreateForm ? (
          <CreateSessionForm
            newProtocol={nc.newProtocol}
            newMode={nc.newMode}
            newHost={nc.newHost}
            newPort={nc.newPort}
            newName={nc.newName}
            loading={nc.loading}
            onProtocolChange={nc.setNewProtocol}
            onModeChange={nc.setNewMode}
            onHostChange={nc.setNewHost}
            onPortChange={nc.setNewPort}
            onNameChange={nc.setNewName}
            onSubmit={nc.handleCreateSession}
            onCancel={() => nc.setShowCreateForm(false)}
          />
        ) : nc.selectedSession ? (
          <>
            <SessionToolbar
              session={nc.selectedSession}
              autoSend={nc.currentAutoSend}
              loading={nc.loading}
              onStart={nc.handleStartSession}
              onStop={nc.handleStopSession}
              onClear={nc.handleClearMessages}
              onRemove={nc.handleRemoveSession}
            />

            <StatsBar
              session={nc.selectedSession}
              messages={nc.messages}
              autoScroll={nc.autoScroll}
              onAutoScrollChange={nc.setAutoScroll}
              onCopyMessages={nc.copyAllMessages}
              onClearPanel={nc.clearPanelMessages}
              onRefresh={nc.refreshMessages}
            />

            {nc.selectedSession.mode === "server" && (
              <ClientList
                clients={nc.clients}
                onDisconnectClient={nc.handleDisconnectClient}
              />
            )}

            <MessageList
              messages={nc.messages}
              autoScroll={nc.autoScroll}
            />

            <SendArea
              session={nc.selectedSession}
              clients={nc.clients}
              sendData={nc.sendData}
              sendFormat={nc.sendFormat}
              targetClient={nc.targetClient}
              broadcast={nc.broadcast}
              autoSend={nc.currentAutoSend}
              autoSendCount={nc.currentAutoSendCount}
              showAutoSendPanel={nc.showAutoSendPanel}
              onSendDataChange={nc.setSendData}
              onSendFormatChange={nc.setSendFormat}
              onTargetClientChange={nc.setTargetClient}
              onBroadcastChange={nc.setBroadcast}
              onSendMessage={() => nc.handleSendMessage()}
              onToggleAutoSend={nc.toggleAutoSend}
              onUpdateAutoSendConfig={nc.updateAutoSendConfig}
              onToggleAutoSendPanel={() => nc.setShowAutoSendPanel(!nc.showAutoSendPanel)}
            />
          </>
        ) : (
          <EmptyState onCreateSession={() => nc.setShowCreateForm(true)} />
        )}
      </div>
    </div>
  );
}
