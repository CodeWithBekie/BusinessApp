namespace AiBusinessPlatform.Domain;

public enum BusinessStatus { Active, Suspended }

public enum BusinessUserRole { Owner, Manager, Cashier, InventoryClerk, Accountant }

public enum CatalogItemType { Stock, TimeBased, Quote }

public enum TimeSlotStatus { Available, Reserved, Booked }

public enum ConversationStatus { Open, Closed }

public enum MessageDirection { Inbound, Outbound }

// Only ever populated for Outbound messages — Inbound rows stay at the default. Pending is
// pre-send (or send in progress); Sent means our own API call to Meta succeeded; Delivered/Read
// come later from Meta's own status webhook; Failed covers both our-side send exceptions (which
// get automatic retry via NextAttemptAt) and Meta-reported async failures (terminal, no retry).
public enum MessageDeliveryStatus { Pending, Sent, Delivered, Read, Failed }

public enum OrderStatus { Quoted, Invoiced, Paid, Fulfilled, Cancelled }

public enum PaymentProvider { EcoCash, Bank, Other, Cash }

public enum PaymentStatus { Pending, Confirmed, Failed }

public enum DeliveryStatus { Pending, Assigned, InTransit, Delivered }

public enum ApprovalStatus { Pending, Approved, Rejected }

public enum AuditActorType { System, User }

public enum WhatsAppConnectionStatus { Pending, Active, Disabled }

public enum McpIntegrationAccountStatus { Active, Revoked }

public enum PurchaseOrderStatus { Draft, Ordered, Received, Cancelled }
