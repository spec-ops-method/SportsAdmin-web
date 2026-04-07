-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'coordinator', 'operator', 'viewer');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'viewer',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_carnivals" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "carnival_id" INTEGER NOT NULL,

    CONSTRAINT "user_carnivals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carnivals" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "carnivals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carnival_settings" (
    "carnival_id" INTEGER NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "footer" VARCHAR(100),
    "open_age" INTEGER NOT NULL DEFAULT 99,
    "house_type_id" INTEGER,
    "alert_to_record" BOOLEAN NOT NULL DEFAULT true,
    "report_head_1" VARCHAR(50) NOT NULL DEFAULT 'Lane',
    "report_head_2" VARCHAR(50) NOT NULL DEFAULT 'Time',
    "meet_manager_team" VARCHAR(30),
    "meet_manager_code" VARCHAR(4),
    "meet_manager_top" INTEGER NOT NULL DEFAULT 3,
    "html_export_enabled" BOOLEAN NOT NULL DEFAULT false,
    "html_report_header" VARCHAR(50),
    "public_access" BOOLEAN NOT NULL DEFAULT false,
    "age_cutoff_month" INTEGER NOT NULL DEFAULT 1,
    "age_cutoff_day" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "carnival_settings_pkey" PRIMARY KEY ("carnival_id")
);

-- CreateTable
CREATE TABLE "houses" (
    "id" SERIAL NOT NULL,
    "carnival_id" INTEGER NOT NULL,
    "code" VARCHAR(7) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "house_type_id" INTEGER,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "details" TEXT,
    "lane" INTEGER,
    "competition_pool" INTEGER,
    "flag" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_points_extra" (
    "id" SERIAL NOT NULL,
    "house_id" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,

    CONSTRAINT "house_points_extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_types" (
    "id" SERIAL NOT NULL,
    "r_code" INTEGER NOT NULL,
    "description" VARCHAR(50) NOT NULL,

    CONSTRAINT "report_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_ascending" BOOLEAN NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "house_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_level_labels" (
    "level" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "final_level_labels_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" SERIAL NOT NULL,
    "carnival_id" INTEGER NOT NULL,
    "given_name" VARCHAR(30) NOT NULL,
    "surname" VARCHAR(30) NOT NULL,
    "sex" CHAR(1) NOT NULL,
    "age" INTEGER NOT NULL,
    "dob" DATE,
    "house_id" INTEGER NOT NULL,
    "house_code" VARCHAR(10) NOT NULL,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "total_points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "external_id" VARCHAR(50),
    "comments" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitor_event_age" (
    "carnival_id" INTEGER NOT NULL,
    "competitor_age" INTEGER NOT NULL,
    "event_age" VARCHAR(20) NOT NULL,
    "flag" BOOLEAN NOT NULL DEFAULT true,
    "tag" BOOLEAN NOT NULL DEFAULT false,
    "meet_manager_division" VARCHAR(2),

    CONSTRAINT "competitor_event_age_pkey" PRIMARY KEY ("carnival_id","competitor_age","event_age")
);

-- CreateTable
CREATE TABLE "event_types" (
    "id" SERIAL NOT NULL,
    "carnival_id" INTEGER NOT NULL,
    "description" VARCHAR(30) NOT NULL,
    "units" VARCHAR(20) NOT NULL,
    "lane_count" INTEGER NOT NULL DEFAULT 0,
    "report_type_id" INTEGER,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "flag" BOOLEAN NOT NULL DEFAULT true,
    "entrant_count" INTEGER NOT NULL DEFAULT 1,
    "places_across_all_heats" BOOLEAN NOT NULL DEFAULT false,
    "meet_manager_event" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "event_type_id" INTEGER NOT NULL,
    "sex" CHAR(1) NOT NULL,
    "age" VARCHAR(10) NOT NULL,
    "include" BOOLEAN NOT NULL DEFAULT true,
    "record" VARCHAR(20),
    "numeric_record" DOUBLE PRECISION,
    "record_name" VARCHAR(60),
    "record_house_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_levels" (
    "event_type_id" INTEGER NOT NULL,
    "final_level" INTEGER NOT NULL,
    "num_heats" INTEGER NOT NULL DEFAULT 1,
    "point_scale" VARCHAR(30),
    "promotion_type" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "use_times" BOOLEAN NOT NULL DEFAULT true,
    "promote_count" INTEGER NOT NULL DEFAULT 0,
    "effects_records" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "final_levels_pkey" PRIMARY KEY ("event_type_id","final_level")
);

-- CreateTable
CREATE TABLE "heats" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "heat_number" INTEGER NOT NULL,
    "final_level" INTEGER NOT NULL,
    "point_scale" VARCHAR(30),
    "promotion_type" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "use_times" BOOLEAN NOT NULL DEFAULT true,
    "effects_records" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'future',
    "event_number" INTEGER,
    "event_time" VARCHAR(10),
    "dont_override_places" BOOLEAN NOT NULL DEFAULT false,
    "all_names" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "heats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comp_events" (
    "id" SERIAL NOT NULL,
    "competitor_id" INTEGER NOT NULL,
    "event_id" INTEGER NOT NULL,
    "heat_id" INTEGER NOT NULL,
    "heat_number" INTEGER NOT NULL,
    "final_level" INTEGER NOT NULL,
    "lane" INTEGER,
    "place" INTEGER NOT NULL DEFAULT 0,
    "result" VARCHAR(20),
    "numeric_result" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memo" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lane_templates" (
    "event_type_id" INTEGER NOT NULL,
    "lane_number" INTEGER NOT NULL,

    CONSTRAINT "lane_templates_pkey" PRIMARY KEY ("event_type_id","lane_number")
);

-- CreateTable
CREATE TABLE "lanes" (
    "carnival_id" INTEGER NOT NULL,
    "lane_number" INTEGER NOT NULL,
    "house_id" INTEGER,

    CONSTRAINT "lanes_pkey" PRIMARY KEY ("carnival_id","lane_number")
);

-- CreateTable
CREATE TABLE "lane_promotion_allocations" (
    "event_type_id" INTEGER NOT NULL,
    "place" INTEGER NOT NULL,
    "lane" INTEGER NOT NULL,

    CONSTRAINT "lane_promotion_allocations_pkey" PRIMARY KEY ("event_type_id","place")
);

-- CreateTable
CREATE TABLE "point_scales" (
    "carnival_id" INTEGER NOT NULL,
    "name" VARCHAR(10) NOT NULL,

    CONSTRAINT "point_scales_pkey" PRIMARY KEY ("carnival_id","name")
);

-- CreateTable
CREATE TABLE "point_scale_entries" (
    "carnival_id" INTEGER NOT NULL,
    "scale_name" VARCHAR(10) NOT NULL,
    "place" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "point_scale_entries_pkey" PRIMARY KEY ("carnival_id","scale_name","place")
);

-- CreateTable
CREATE TABLE "records" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "surname" VARCHAR(30) NOT NULL,
    "given_name" VARCHAR(30) NOT NULL,
    "house_code" VARCHAR(10),
    "date" DATE NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "numeric_result" DOUBLE PRECISION NOT NULL,
    "comments" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_carnivals_user_id_carnival_id_key" ON "user_carnivals"("user_id", "carnival_id");

-- CreateIndex
CREATE UNIQUE INDEX "carnivals_name_key" ON "carnivals"("name");

-- CreateIndex
CREATE UNIQUE INDEX "houses_carnival_id_code_key" ON "houses"("carnival_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "report_types_r_code_key" ON "report_types"("r_code");

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "house_types_name_key" ON "house_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "event_types_carnival_id_description_key" ON "event_types"("carnival_id", "description");

-- CreateIndex
CREATE UNIQUE INDEX "events_event_type_id_sex_age_key" ON "events"("event_type_id", "sex", "age");

-- CreateIndex
CREATE UNIQUE INDEX "comp_events_competitor_id_event_id_final_level_heat_number_key" ON "comp_events"("competitor_id", "event_id", "final_level", "heat_number");

-- AddForeignKey
ALTER TABLE "user_carnivals" ADD CONSTRAINT "user_carnivals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_carnivals" ADD CONSTRAINT "user_carnivals_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carnival_settings" ADD CONSTRAINT "carnival_settings_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_house_type_id_fkey" FOREIGN KEY ("house_type_id") REFERENCES "house_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_points_extra" ADD CONSTRAINT "house_points_extra_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competitor_event_age" ADD CONSTRAINT "competitor_event_age_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_types" ADD CONSTRAINT "event_types_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_record_house_id_fkey" FOREIGN KEY ("record_house_id") REFERENCES "houses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_levels" ADD CONSTRAINT "final_levels_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heats" ADD CONSTRAINT "heats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comp_events" ADD CONSTRAINT "comp_events_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comp_events" ADD CONSTRAINT "comp_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comp_events" ADD CONSTRAINT "comp_events_heat_id_fkey" FOREIGN KEY ("heat_id") REFERENCES "heats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lane_templates" ADD CONSTRAINT "lane_templates_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lanes" ADD CONSTRAINT "lanes_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lanes" ADD CONSTRAINT "lanes_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lane_promotion_allocations" ADD CONSTRAINT "lane_promotion_allocations_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_scales" ADD CONSTRAINT "point_scales_carnival_id_fkey" FOREIGN KEY ("carnival_id") REFERENCES "carnivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_scale_entries" ADD CONSTRAINT "point_scale_entries_carnival_id_scale_name_fkey" FOREIGN KEY ("carnival_id", "scale_name") REFERENCES "point_scales"("carnival_id", "name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records" ADD CONSTRAINT "records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
