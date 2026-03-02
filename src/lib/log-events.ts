export const LOG_EVENT_LABELS: Record<string, string> = {
  link_created: "链接创建",
  link_created_api: "API 创建链接",
  redirect_success: "成功跳转",
  redirect_blocked_expired: "过期拦截",
  redirect_blocked_max_clicks: "点击上限拦截",
  link_auto_deleted_expired: "过期自动删除",
  link_auto_deleted_max_clicks: "达到点击上限自动删除",
  link_manual_deleted_by_user: "用户手动删除",
  link_manual_deleted_by_admin: "管理员手动删除",
}

export function getLogEventLabel(eventType: string): string {
  return LOG_EVENT_LABELS[eventType] || eventType
}
