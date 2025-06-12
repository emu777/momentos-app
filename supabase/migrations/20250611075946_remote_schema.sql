

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."chat_requests" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "room_id" "uuid" NOT NULL,
    "status" "text" DEFAULT '''pending'''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_rooms" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user1_id" "uuid" NOT NULL,
    "user2_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "affection_level" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "affection_level_check" CHECK ((("affection_level" >= 0) AND ("affection_level" <= 100)))
);


ALTER TABLE "public"."chat_rooms" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_rooms" IS 'チャットルームの管理';



CREATE TABLE IF NOT EXISTS "public"."daily_topics" (
    "id" integer NOT NULL,
    "topic_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_topics" OWNER TO "postgres";


COMMENT ON TABLE "public"."daily_topics" IS '日替わりの「今日の話題」を保存するテーブル';



CREATE SEQUENCE IF NOT EXISTS "public"."daily_topics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."daily_topics_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."daily_topics_id_seq" OWNED BY "public"."daily_topics"."id";



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "room_id" "uuid" NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."messages" IS 'チャット';



COMMENT ON COLUMN "public"."messages"."sender_id" IS '送信者ID';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "nickname" "text" NOT NULL,
    "bio" "text",
    "age" integer,
    "residence" "text",
    "sexuality" "text",
    "interests" "text"[],
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "topic" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topic_cycle_status" (
    "config_id" "text" DEFAULT 'default_cycle_status'::"text" NOT NULL,
    "current_topic_id" integer,
    "last_changed_at" timestamp with time zone,
    "used_topic_ids" integer[] DEFAULT ARRAY[]::integer[]
);


ALTER TABLE "public"."topic_cycle_status" OWNER TO "postgres";


COMMENT ON TABLE "public"."topic_cycle_status" IS '今日の話題のローテーション状態を管理するテーブル';



CREATE TABLE IF NOT EXISTS "public"."topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "text" "text" NOT NULL
);


ALTER TABLE "public"."topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "is_online" boolean DEFAULT false,
    "last_active_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_statuses" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_statuses" IS 'オンライン中かどうか';



ALTER TABLE ONLY "public"."daily_topics" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."daily_topics_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."chat_requests"
    ADD CONSTRAINT "chat_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_topics"
    ADD CONSTRAINT "daily_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."topic_cycle_status"
    ADD CONSTRAINT "topic_cycle_status_pkey" PRIMARY KEY ("config_id");



ALTER TABLE ONLY "public"."topics"
    ADD CONSTRAINT "topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "unique_user_pair" UNIQUE ("user1_id", "user2_id");



ALTER TABLE ONLY "public"."user_statuses"
    ADD CONSTRAINT "user_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_statuses"
    ADD CONSTRAINT "user_statuses_user_id_key" UNIQUE ("user_id");



CREATE OR REPLACE TRIGGER "on_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."chat_requests"
    ADD CONSTRAINT "chat_requests_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."chat_requests"
    ADD CONSTRAINT "chat_requests_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id");



ALTER TABLE ONLY "public"."chat_requests"
    ADD CONSTRAINT "chat_requests_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_user1_id_fkey" FOREIGN KEY ("user1_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."chat_rooms"
    ADD CONSTRAINT "chat_rooms_user2_id_fkey" FOREIGN KEY ("user2_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."chat_rooms"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topic_cycle_status"
    ADD CONSTRAINT "topic_cycle_status_current_topic_id_fkey" FOREIGN KEY ("current_topic_id") REFERENCES "public"."daily_topics"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_statuses"
    ADD CONSTRAINT "user_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



CREATE POLICY "Allow all users to read profiles" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow all users to read user statuses" ON "public"."user_statuses" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Allow authenticated user to insert their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated user to insert their own status" ON "public"."user_statuses" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated user to update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated user to update their own status" ON "public"."user_statuses" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Allow authenticated users to insert their own messages" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."chat_rooms"
  WHERE (("chat_rooms"."id" = "messages"."room_id") AND (("chat_rooms"."user1_id" = "auth"."uid"()) OR ("chat_rooms"."user2_id" = "auth"."uid"())))))));



CREATE POLICY "Allow authenticated users to send chat requests" ON "public"."chat_requests" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Allow chat_room access for participants" ON "public"."chat_rooms" FOR SELECT USING ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "Allow client read and update of topic cycle status" ON "public"."topic_cycle_status" USING (("config_id" = 'default_cycle_status'::"text")) WITH CHECK (("config_id" = 'default_cycle_status'::"text"));



CREATE POLICY "Allow participants to create their own chat_rooms" ON "public"."chat_rooms" FOR INSERT WITH CHECK ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "Allow participants to delete their chat_rooms" ON "public"."chat_rooms" FOR DELETE USING ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "Allow participants to read their chat messages" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_rooms"
  WHERE (("chat_rooms"."id" = "messages"."room_id") AND (("chat_rooms"."user1_id" = "auth"."uid"()) OR ("chat_rooms"."user2_id" = "auth"."uid"()))))));



CREATE POLICY "Allow participants to view their chat requests" ON "public"."chat_requests" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "Allow receiver to update request status" ON "public"."chat_requests" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "receiver_id")) WITH CHECK (("auth"."uid"() = "receiver_id"));



CREATE POLICY "Enable insert for authenticated users only" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."messages" FOR SELECT USING (true);



ALTER TABLE "public"."chat_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_statuses" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_requests";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_rooms";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."user_statuses";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."chat_requests" TO "anon";
GRANT ALL ON TABLE "public"."chat_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_requests" TO "service_role";



GRANT ALL ON TABLE "public"."chat_rooms" TO "anon";
GRANT ALL ON TABLE "public"."chat_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."daily_topics" TO "anon";
GRANT ALL ON TABLE "public"."daily_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_topics" TO "service_role";



GRANT ALL ON SEQUENCE "public"."daily_topics_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."daily_topics_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."daily_topics_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."topic_cycle_status" TO "anon";
GRANT ALL ON TABLE "public"."topic_cycle_status" TO "authenticated";
GRANT ALL ON TABLE "public"."topic_cycle_status" TO "service_role";



GRANT ALL ON TABLE "public"."topics" TO "anon";
GRANT ALL ON TABLE "public"."topics" TO "authenticated";
GRANT ALL ON TABLE "public"."topics" TO "service_role";



GRANT ALL ON TABLE "public"."user_statuses" TO "anon";
GRANT ALL ON TABLE "public"."user_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."user_statuses" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






























RESET ALL;
