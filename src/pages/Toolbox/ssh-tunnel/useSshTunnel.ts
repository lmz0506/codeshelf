import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  addSshTunnel,
  getSshTunnels,
  listSshConfigHosts,
  removeSshTunnel,
  startSshTunnel,
  stopSshTunnel,
  testSshTunnel,
  updateSshTunnel,
} from "@/services/toolbox";
import type { SshAuthMethod, SshTunnel, SshTunnelInput } from "@/types/toolbox";
import type { AuthType, DeleteConfirmState, TestState } from "./types";

const DEFAULT_PORT = "22";

export function useSshTunnel() {
  const [tunnels, setTunnels] = useState<SshTunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editing, setEditing] = useState<SshTunnel | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [sshConfigHosts, setSshConfigHosts] = useState<string[]>([]);
  const [testState, setTestState] = useState<TestState | null>(null);

  // 表单状态
  const [formName, setFormName] = useState("");
  const [formLocalPort, setFormLocalPort] = useState("");
  const [formRemoteHost, setFormRemoteHost] = useState("127.0.0.1");
  const [formRemotePort, setFormRemotePort] = useState("");
  const [formSshHost, setFormSshHost] = useState("");
  const [formSshPort, setFormSshPort] = useState(DEFAULT_PORT);
  const [formSshUser, setFormSshUser] = useState("root");
  const [formAuthType, setFormAuthType] = useState<AuthType>("key");
  const [formKeyPath, setFormKeyPath] = useState("");
  const [formPassphrase, setFormPassphrase] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formHostAlias, setFormHostAlias] = useState("");

  useEffect(() => {
    loadAll();
    listSshConfigHosts()
      .then(setSshConfigHosts)
      .catch((err) => console.warn("读取 ~/.ssh/config 失败:", err));
    const interval = setInterval(loadAll, 2000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    try {
      const data = await getSshTunnels();
      setTunnels(data);
    } catch (err) {
      console.error("加载 SSH 隧道失败:", err);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormName("");
    setFormLocalPort("");
    setFormRemoteHost("127.0.0.1");
    setFormRemotePort("");
    setFormSshHost("");
    setFormSshPort(DEFAULT_PORT);
    setFormSshUser("root");
    setFormAuthType("key");
    setFormKeyPath("");
    setFormPassphrase("");
    setFormPassword("");
    setFormHostAlias("");
    setEditing(null);
  }

  function openCreateDialog() {
    resetForm();
    setShowAddDialog(true);
  }

  function closeFormDialog() {
    setShowAddDialog(false);
    resetForm();
  }

  function openEditDialog(t: SshTunnel) {
    setEditing(t);
    setFormName(t.name);
    setFormLocalPort(String(t.localPort));
    setFormRemoteHost(t.remoteHost);
    setFormRemotePort(String(t.remotePort));
    setFormSshHost(t.sshHost);
    setFormSshPort(String(t.sshPort));
    setFormSshUser(t.sshUser);
    setFormAuthType(t.auth.type);
    if (t.auth.type === "key") {
      setFormKeyPath(t.auth.keyPath);
      setFormPassphrase(t.auth.passphrase || "");
    } else if (t.auth.type === "password") {
      setFormPassword(t.auth.password);
    } else if (t.auth.type === "sshConfig") {
      setFormHostAlias(t.auth.hostAlias);
    }
    setShowAddDialog(true);
  }

  async function handleSelectKey() {
    try {
      const home = await import("@tauri-apps/api/path").then((m) => m.homeDir());
      const selected = await open({
        directory: false,
        multiple: false,
        title: "选择 SSH 私钥",
        defaultPath: `${home}/.ssh`,
      });
      if (selected) setFormKeyPath(selected as string);
    } catch (err) {
      console.error("选择私钥失败:", err);
    }
  }

  function buildAuth(): SshAuthMethod | null {
    if (formAuthType === "key") {
      if (!formKeyPath.trim()) {
        alert("请选择私钥文件");
        return null;
      }
      return {
        type: "key",
        keyPath: formKeyPath.trim(),
        passphrase: formPassphrase || undefined,
      };
    }
    if (formAuthType === "password") {
      if (!formPassword) {
        alert("请输入密码");
        return null;
      }
      return { type: "password", password: formPassword };
    }
    if (!formHostAlias.trim()) {
      alert("请选择或输入 SSH config Host 别名");
      return null;
    }
    return { type: "sshConfig", hostAlias: formHostAlias.trim() };
  }

  async function handleSubmit() {
    const localPort = parseInt(formLocalPort);
    const remotePort = parseInt(formRemotePort);
    const sshPort = parseInt(formSshPort);
    if (!formName.trim() || Number.isNaN(localPort) || Number.isNaN(remotePort)) {
      alert("请填写完整：名称 / 本地端口 / 远程端口");
      return;
    }
    if (formAuthType !== "sshConfig") {
      if (!formSshHost.trim() || Number.isNaN(sshPort) || !formSshUser.trim()) {
        alert("请填写完整：SSH 主机 / 端口 / 用户");
        return;
      }
    }
    const auth = buildAuth();
    if (!auth) return;

    const input: SshTunnelInput = {
      name: formName.trim(),
      localPort,
      remoteHost: formRemoteHost.trim() || "127.0.0.1",
      remotePort,
      sshHost: formSshHost.trim(),
      sshPort: Number.isNaN(sshPort) ? 22 : sshPort,
      sshUser: formSshUser.trim() || undefined,
      auth,
    };

    try {
      if (editing) {
        await updateSshTunnel(editing.id, input);
      } else {
        await addSshTunnel(input);
      }
      closeFormDialog();
      loadAll();
    } catch (err) {
      console.error("保存 SSH 隧道失败:", err);
      alert(`保存 SSH 隧道失败: ${err}`);
    }
  }

  async function handleStart(id: string) {
    try {
      await startSshTunnel(id);
      loadAll();
    } catch (err) {
      console.error("启动隧道失败:", err);
      alert(`启动隧道失败: ${err}`);
    }
  }

  async function handleStop(id: string) {
    try {
      await stopSshTunnel(id);
      loadAll();
    } catch (err) {
      console.error("停止隧道失败:", err);
    }
  }

  function handleRemove(t: SshTunnel) {
    setDeleteConfirm({ id: t.id, name: t.name });
  }

  async function confirmRemove() {
    if (!deleteConfirm) return;
    try {
      await removeSshTunnel(deleteConfirm.id);
      loadAll();
    } catch (err) {
      console.error("删除隧道失败:", err);
    } finally {
      setDeleteConfirm(null);
    }
  }

  async function handleCopyLocal(t: SshTunnel) {
    try {
      await navigator.clipboard.writeText(`127.0.0.1:${t.localPort}`);
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("复制失败:", err);
    }
  }

  async function handleTest(t: SshTunnel) {
    setTestState({ tunnelId: t.id, loading: true });
    try {
      const result = await testSshTunnel(t.id);
      setTestState({ tunnelId: t.id, loading: false, result });
    } catch (err) {
      setTestState({
        tunnelId: t.id,
        loading: false,
        result: {
          success: false,
          output: String(err),
          method: "tcp",
          durationMs: 0,
        },
      });
    }
  }

  function dismissTest() {
    setTestState(null);
  }

  return {
    tunnels,
    loading,
    showAddDialog,
    deleteConfirm,
    copiedId,
    sshConfigHosts,
    testState,
    dismissTest,
    loadAll,
    openCreateDialog,
    listCallbacks: {
      onStart: handleStart,
      onStop: handleStop,
      onEdit: openEditDialog,
      onRemove: handleRemove,
      onCopyLocal: handleCopyLocal,
      onTest: handleTest,
    },
    formProps: {
      editing,
      formName,
      formLocalPort,
      formRemoteHost,
      formRemotePort,
      formSshHost,
      formSshPort,
      formSshUser,
      formAuthType,
      formKeyPath,
      formPassphrase,
      formPassword,
      formHostAlias,
      sshConfigHosts,
      onFormNameChange: setFormName,
      onFormLocalPortChange: setFormLocalPort,
      onFormRemoteHostChange: setFormRemoteHost,
      onFormRemotePortChange: setFormRemotePort,
      onFormSshHostChange: setFormSshHost,
      onFormSshPortChange: setFormSshPort,
      onFormSshUserChange: setFormSshUser,
      onFormAuthTypeChange: setFormAuthType,
      onFormKeyPathChange: setFormKeyPath,
      onFormPassphraseChange: setFormPassphrase,
      onFormPasswordChange: setFormPassword,
      onFormHostAliasChange: setFormHostAlias,
      onSelectKey: handleSelectKey,
      onCancel: closeFormDialog,
      onSubmit: handleSubmit,
    },
    deleteDialogProps: deleteConfirm
      ? {
          confirm: deleteConfirm,
          onCancel: () => setDeleteConfirm(null),
          onConfirm: confirmRemove,
        }
      : null,
  };
}
