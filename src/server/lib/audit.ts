export const AuditActions = [
  "user.login",
  "user.register",
  "user.logout",
  "user.guest_create",
  "user.guest_claim",
  "user.guest_cleanup",
  "user.delete",
  "user.admin_toggle",
  "schedule.create",
  "schedule.delete",
  "schedule.edit",
  "schedule.import_code",
  "upload.create",
  "feedback.submit",
  "widget.token_create",
  "widget.token_regenerate",
  "admin.action",
  "reminders.update",
  "reminders.cron",
  "reminders.todos",
  "reminders.qstash",
  "todo.clear_completed",
  "push.subscribe",
  "push.unsubscribe",
  "notification.delete",
] as const;

export type AuditAction = (typeof AuditActions)[number];

export function auditLog(action: AuditAction, metadata?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      type: "audit",
      action,
      timestamp: new Date().toISOString(),
      ...metadata,
    })
  );
}
