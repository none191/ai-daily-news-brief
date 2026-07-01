-- Baseline schema for empty database deploys.

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('NEW', 'DUPLICATE', 'CLASSIFIED', 'SCORED', 'SELECTED', 'SUMMARIZED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BriefSection" AS ENUM ('TOP_OVERALL', 'TOP_CATEGORY', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'COMPLETED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'LINE', 'DASHBOARD');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PipelineStep" AS ENUM ('FETCH', 'DEDUPE', 'CLASSIFY', 'SCORE', 'SELECT', 'SUMMARIZE', 'GENERATE_BRIEF', 'NOTIFY');

-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rssUrl" TEXT NOT NULL,
    "defaultCategoryId" TEXT,
    "reliabilityScore" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastFetchStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 3,
    "categoryId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_articles" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "imageUrl" TEXT,
    "rawContent" TEXT,
    "contentHash" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categoryId" TEXT,
    "status" "ArticleStatus" NOT NULL DEFAULT 'NEW',
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "clusterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_clusters" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_scores" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "recencyScore" INTEGER NOT NULL DEFAULT 0,
    "keywordScore" INTEGER NOT NULL DEFAULT 0,
    "sourceScore" INTEGER NOT NULL DEFAULT 0,
    "crossSourceScore" INTEGER NOT NULL DEFAULT 0,
    "categoryScore" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_summaries" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "shortSummary" TEXT NOT NULL,
    "detailedSummary" TEXT NOT NULL,
    "whyImportant" TEXT,
    "impact" TEXT,
    "followUpNote" TEXT,
    "shouldFollowUp" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_briefs" (
    "id" TEXT NOT NULL,
    "briefDate" DATE NOT NULL,
    "status" "BriefStatus" NOT NULL DEFAULT 'PENDING',
    "topOverallCount" INTEGER NOT NULL DEFAULT 5,
    "topCategoryCount" INTEGER NOT NULL DEFAULT 3,
    "followUpCount" INTEGER NOT NULL DEFAULT 3,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_brief_items" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "section" "BriefSection" NOT NULL,
    "categoryId" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_brief_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "briefId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "line_identities" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "line_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_logs" (
    "id" TEXT NOT NULL,
    "step" "PipelineStep" NOT NULL,
    "status" "PipelineStatus" NOT NULL DEFAULT 'RUNNING',
    "sourceId" TEXT,
    "itemsProcessed" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "pipeline_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "news_sources_rssUrl_key" ON "news_sources"("rssUrl");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_term_categoryId_key" ON "keywords"("term", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "news_articles_link_key" ON "news_articles"("link");

-- CreateIndex
CREATE INDEX "news_articles_contentHash_idx" ON "news_articles"("contentHash");

-- CreateIndex
CREATE INDEX "news_articles_publishedAt_idx" ON "news_articles"("publishedAt");

-- CreateIndex
CREATE INDEX "news_articles_status_idx" ON "news_articles"("status");

-- CreateIndex
CREATE INDEX "news_articles_categoryId_idx" ON "news_articles"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "article_scores_articleId_key" ON "article_scores"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_summaries_articleId_key" ON "ai_summaries"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefs_briefDate_key" ON "daily_briefs"("briefDate");

-- CreateIndex
CREATE INDEX "daily_brief_items_briefId_section_idx" ON "daily_brief_items"("briefId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "daily_brief_items_briefId_articleId_section_key" ON "daily_brief_items"("briefId", "articleId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "line_identities_lineId_key" ON "line_identities"("lineId");

-- CreateIndex
CREATE INDEX "pipeline_logs_step_startedAt_idx" ON "pipeline_logs"("step", "startedAt");

-- AddForeignKey
ALTER TABLE "news_sources" ADD CONSTRAINT "news_sources_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "news_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "news_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "article_clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_scores" ADD CONSTRAINT "article_scores_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_brief_items" ADD CONSTRAINT "daily_brief_items_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "daily_briefs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_brief_items" ADD CONSTRAINT "daily_brief_items_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "daily_briefs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_logs" ADD CONSTRAINT "pipeline_logs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "news_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
