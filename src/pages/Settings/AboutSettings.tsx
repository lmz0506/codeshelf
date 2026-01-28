import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { CheckCircle, XCircle, Loader2, ExternalLink, Github, Heart } from "lucide-react";

interface DependencyStatus {
  name: string;
  description: string;
  required: boolean;
  checking: boolean;
  installed: boolean | null;
  version: string | null;
  downloadUrl: string;
}

interface AboutSettingsProps {
  onClose?: () => void;
}

export function AboutSettings(_props: AboutSettingsProps) {
  const [appVersion, setAppVersion] = useState<string>("...");
  const [dependencies, setDependencies] = useState<DependencyStatus[]>([
    {
      name: "Git",
      description: "版本控制系统，用于管理项目仓库",
      required: true,
      checking: true,
      installed: null,
      version: null,
      downloadUrl: "https://git-scm.com/downloads",
    },
    {
      name: "Node.js",
      description: "JavaScript 运行时，用于发版脚本",
      required: false,
      checking: true,
      installed: null,
      version: null,
      downloadUrl: "https://nodejs.org/",
    },
  ]);

  useEffect(() => {
    // 获取应用版本
    getVersion().then(setAppVersion).catch(() => setAppVersion("未知"));

    // 检查依赖
    checkDependencies();
  }, []);

  const checkDependencies = async () => {
    // 检查 Git
    try {
      const gitVersion = await invoke<string>("check_git_version");
      updateDependency("Git", true, gitVersion);
    } catch {
      updateDependency("Git", false, null);
    }

    // 检查 Node.js
    try {
      const nodeVersion = await invoke<string>("check_node_version");
      updateDependency("Node.js", true, nodeVersion);
    } catch {
      updateDependency("Node.js", false, null);
    }
  };

  const updateDependency = (name: string, installed: boolean, version: string | null) => {
    setDependencies(prev =>
      prev.map(dep =>
        dep.name === name
          ? { ...dep, checking: false, installed, version }
          : dep
      )
    );
  };

  const openUrl = async (url: string) => {
    try {
      await invoke("open_url", { url });
    } catch (e) {
      console.error("Failed to open URL:", e);
    }
  };

  return (
    <div className="space-y-6">
      {/* 应用信息 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">应用信息</h3>

        <div className="re-card p-4 space-y-3">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              CS
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">CodeShelf</h2>
              <p className="text-sm text-gray-500">代码书架 - 本地项目管理工具</p>
              <p className="text-sm text-blue-500 font-medium mt-1">v{appVersion}</p>
            </div>
          </div>

          <div className="pt-3 border-t border-gray-100 flex items-center gap-4">
            <button
              onClick={() => openUrl("https://github.com/en-o/codeshelf")}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-500 transition-colors"
            >
              <Github size={16} />
              <span>GitHub</span>
              <ExternalLink size={12} />
            </button>
            <span className="text-gray-300">|</span>
            <span className="flex items-center gap-1 text-sm text-gray-500">
              Made with <Heart size={14} className="text-red-500" /> by en-o
            </span>
          </div>
        </div>
      </div>

      {/* 系统依赖 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">系统依赖</h3>

        <div className="space-y-3">
          {dependencies.map((dep) => (
            <div
              key={dep.name}
              className="re-card p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                {dep.checking ? (
                  <Loader2 size={20} className="text-blue-500 animate-spin" />
                ) : dep.installed ? (
                  <CheckCircle size={20} className="text-green-500" />
                ) : (
                  <XCircle size={20} className="text-red-500" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{dep.name}</span>
                    {dep.required && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded">
                        必需
                      </span>
                    )}
                    {!dep.required && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        可选
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">{dep.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {dep.checking ? (
                  <span className="text-sm text-gray-400">检测中...</span>
                ) : dep.installed ? (
                  <span className="text-sm text-green-600 font-medium">
                    {dep.version || "已安装"}
                  </span>
                ) : (
                  <button
                    onClick={() => openUrl(dep.downloadUrl)}
                    className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    <span>下载安装</span>
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400">
          * 必需依赖未安装时，部分功能将无法使用
        </p>
      </div>

      {/* 技术栈 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">技术栈</h3>

        <div className="re-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: "Tauri", version: "2.x", color: "bg-yellow-100 text-yellow-700" },
              { name: "React", version: "18.x", color: "bg-blue-100 text-blue-700" },
              { name: "TypeScript", version: "5.x", color: "bg-blue-100 text-blue-700" },
              { name: "Rust", version: "1.x", color: "bg-orange-100 text-orange-700" },
              { name: "Tailwind CSS", version: "3.x", color: "bg-cyan-100 text-cyan-700" },
              { name: "Zustand", version: "4.x", color: "bg-purple-100 text-purple-700" },
              { name: "Dexie.js", version: "4.x", color: "bg-green-100 text-green-700" },
              { name: "Lucide", version: "Icons", color: "bg-gray-100 text-gray-700" },
            ].map((tech) => (
              <div
                key={tech.name}
                className={`px-3 py-2 rounded-lg text-center ${tech.color}`}
              >
                <div className="font-medium text-sm">{tech.name}</div>
                <div className="text-xs opacity-75">{tech.version}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 开源协议 */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">开源协议</h3>

        <div className="re-card p-4">
          <p className="text-sm text-gray-600">
            本项目基于 <span className="font-medium text-gray-900">Apache License 2.0</span> 开源。
            您可以自由使用、修改和分发本软件，但需保留版权声明和许可声明。
          </p>
          <button
            onClick={() => openUrl("https://github.com/en-o/codeshelf/blob/main/LICENSE")}
            className="mt-3 flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 transition-colors"
          >
            <span>查看完整协议</span>
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
