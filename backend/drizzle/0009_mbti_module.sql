CREATE TABLE "mbti_hobby_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hobby_tag_id" uuid NOT NULL,
	"type_code" text NOT NULL,
	"match_probability" integer NOT NULL,
	"reason" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mbti_hobby_scores_probability_check" CHECK ("mbti_hobby_scores"."match_probability" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "mbti_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dimension" text NOT NULL,
	"stem" text NOT NULL,
	"option_a" text NOT NULL,
	"option_b" text NOT NULL,
	"option_a_score" text NOT NULL,
	"option_b_score" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mbti_test_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"answers" jsonb NOT NULL,
	"result_type" text NOT NULL,
	"dimension_scores" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mbti_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"nickname" text,
	"description" text NOT NULL,
	"strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mbti_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "mbti_hobby_scores" ADD CONSTRAINT "mbti_hobby_scores_hobby_tag_id_hobby_tags_id_fk" FOREIGN KEY ("hobby_tag_id") REFERENCES "public"."hobby_tags"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mbti_hobby_scores" ADD CONSTRAINT "mbti_hobby_scores_type_code_mbti_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."mbti_types"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mbti_test_records" ADD CONSTRAINT "mbti_test_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mbti_hobby_scores_tag_type_idx" ON "mbti_hobby_scores" USING btree ("hobby_tag_id","type_code");--> statement-breakpoint
CREATE INDEX "mbti_hobby_scores_type_prob_idx" ON "mbti_hobby_scores" USING btree ("type_code","match_probability");--> statement-breakpoint
CREATE INDEX "mbti_questions_sort_idx" ON "mbti_questions" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "mbti_questions_dimension_sort_idx" ON "mbti_questions" USING btree ("dimension","sort_order");--> statement-breakpoint
CREATE INDEX "mbti_test_records_user_created_idx" ON "mbti_test_records" USING btree ("user_id","created_at");