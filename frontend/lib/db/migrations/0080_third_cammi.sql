CREATE TABLE "notification_reads" (
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_reads_pkey" PRIMARY KEY("project_id","user_id","notification_id")
);
