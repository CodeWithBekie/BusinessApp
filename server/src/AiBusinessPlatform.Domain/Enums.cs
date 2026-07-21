namespace AiBusinessPlatform.Domain;

public enum BusinessStatus { Active, Suspended }

public enum BusinessUserRole { Owner, Admin, Staff }

public enum CatalogItemType { Stock, TimeBased, Quote }

public enum TimeSlotStatus { Available, Reserved, Booked }

public enum ConversationStatus { Open, Closed }

public enum MessageDirection { Inbound, Outbound }

public enum OrderStatus { Quoted, Invoiced, Paid, Fulfilled, Cancelled }

public enum PaymentProvider { EcoCash, OneMoney, Other }

public enum PaymentStatus { Pending, Confirmed, Failed }

public enum DeliveryStatus { Pending, Assigned, InTransit, Delivered }

public enum ApprovalStatus { Pending, Approved, Rejected }

public enum AuditActorType { System, User }

public enum WhatsAppConnectionStatus { Pending, Active, Disabled }

public enum McpIntegrationAccountStatus { Active, Revoked }
