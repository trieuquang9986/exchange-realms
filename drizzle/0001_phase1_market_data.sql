CREATE TABLE "daily_prices" (
	"ticker" text NOT NULL,
	"session_date" date NOT NULL,
	"open" integer,
	"high" integer,
	"low" integer,
	"close" integer,
	"reference" integer,
	"ceiling" integer,
	"floor" integer,
	"volume" bigint,
	"shares_outstanding" bigint,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"is_fixture" boolean DEFAULT false NOT NULL,
	CONSTRAINT "daily_prices_ticker_session_date_pk" PRIMARY KEY("ticker","session_date")
);
--> statement-breakpoint
CREATE TABLE "ingestion_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_date" date NOT NULL,
	"detail" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "securities" (
	"ticker" text PRIMARY KEY NOT NULL,
	"company_name" text,
	"exchange" text,
	"status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_sessions" (
	"session_date" date PRIMARY KEY NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "daily_prices" ADD CONSTRAINT "daily_prices_ticker_securities_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."securities"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_prices" ADD CONSTRAINT "daily_prices_session_date_trading_sessions_session_date_fk" FOREIGN KEY ("session_date") REFERENCES "public"."trading_sessions"("session_date") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_prices_session_idx" ON "daily_prices" USING btree ("session_date");