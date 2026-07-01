-- Migration: add_image_url_to_news_article
-- เพิ่มคอลัมน์ imageUrl (nullable) ให้ news_articles
-- รูปไม่บังคับมี เพราะบาง RSS feed ไม่แนบ enclosure/media:content มาด้วย

ALTER TABLE "news_articles" ADD COLUMN "imageUrl" TEXT;
