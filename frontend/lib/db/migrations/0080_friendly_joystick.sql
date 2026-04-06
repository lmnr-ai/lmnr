CREATE TABLE "notification_reads" (
	"user_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_pkey" PRIMARY KEY("user_id","notification_id","project_id")
);
