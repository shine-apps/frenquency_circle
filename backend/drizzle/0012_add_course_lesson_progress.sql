CREATE TABLE "course_lesson_progress" (
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"position_seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_lesson_progress_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id"),
	CONSTRAINT "course_lesson_progress_position_check" CHECK ("position_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "course_lesson_progress" ADD CONSTRAINT "course_lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lesson_progress" ADD CONSTRAINT "course_lesson_progress_lesson_id_course_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_lesson_progress_user_updated_idx" ON "course_lesson_progress" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "course_lesson_progress_lesson_user_idx" ON "course_lesson_progress" USING btree ("lesson_id","user_id");