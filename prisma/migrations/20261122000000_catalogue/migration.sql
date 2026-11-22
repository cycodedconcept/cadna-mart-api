-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `image` VARCHAR(2048) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `categories_active_name_idx`(`active`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `categoryId` CHAR(36) NOT NULL,
    `price` BIGINT UNSIGNED NOT NULL,
    `originalPrice` BIGINT UNSIGNED NOT NULL,
    `description` TEXT NOT NULL,
    `stock` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `products_published_categoryId_price_idx`(`published`, `categoryId`, `price`),
    INDEX `products_published_price_idx`(`published`, `price`),
    INDEX `products_published_name_idx`(`published`, `name`),
    INDEX `products_published_featured_idx`(`published`, `featured`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_images` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `url` VARCHAR(2048) NOT NULL,
    `position` INTEGER UNSIGNED NOT NULL,

    UNIQUE INDEX `product_images_productId_position_key`(`productId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_specifications` (
    `productId` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `value` VARCHAR(2048) NOT NULL,

    PRIMARY KEY (`productId`, `name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_specifications` ADD CONSTRAINT `product_specifications_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve exact JSON integer kobo and prevent misleading reference prices.
ALTER TABLE `products`
  ADD CONSTRAINT `products_price_safe` CHECK (`price` <= 9007199254740991),
  ADD CONSTRAINT `products_original_price_safe` CHECK (`originalPrice` <= 9007199254740991 AND `originalPrice` >= `price`);
