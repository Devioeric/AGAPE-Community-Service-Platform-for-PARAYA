export function isNotificationDeliveryEnabled() {
  return process.env.AGAPE_NOTIFICATION_DELIVERY_V1_ENABLED === "true";
}
