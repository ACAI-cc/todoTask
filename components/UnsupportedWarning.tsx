"use client";

import { useTaskStore } from "@/store/useTaskStore";

export default function UnsupportedWarning() {
  const fileSupported = useTaskStore((s) => s.fileSupported);
  const isOnboarded = useTaskStore((s) => s.isOnboarded);

  if (fileSupported || !isOnboarded) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
      <span className="text-sm text-amber-800">
        ⚠️ 当前浏览器不支持本地文件存储，请导出备份以免数据丢失。推荐使用 Chrome 或 Edge。
      </span>
    </div>
  );
}
