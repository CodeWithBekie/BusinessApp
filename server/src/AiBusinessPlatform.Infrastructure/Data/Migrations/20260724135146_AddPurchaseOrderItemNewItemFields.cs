using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPurchaseOrderItemNewItemFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "CatalogItemId",
                table: "PurchaseOrderItems",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "NewItemName",
                table: "PurchaseOrderItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "NewItemType",
                table: "PurchaseOrderItems",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NewItemUnit",
                table: "PurchaseOrderItems",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PurchaseOrderItems_CatalogItemId",
                table: "PurchaseOrderItems",
                column: "CatalogItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_PurchaseOrderItems_CatalogItems_CatalogItemId",
                table: "PurchaseOrderItems",
                column: "CatalogItemId",
                principalTable: "CatalogItems",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PurchaseOrderItems_CatalogItems_CatalogItemId",
                table: "PurchaseOrderItems");

            migrationBuilder.DropIndex(
                name: "IX_PurchaseOrderItems_CatalogItemId",
                table: "PurchaseOrderItems");

            migrationBuilder.DropColumn(
                name: "NewItemName",
                table: "PurchaseOrderItems");

            migrationBuilder.DropColumn(
                name: "NewItemType",
                table: "PurchaseOrderItems");

            migrationBuilder.DropColumn(
                name: "NewItemUnit",
                table: "PurchaseOrderItems");

            migrationBuilder.AlterColumn<Guid>(
                name: "CatalogItemId",
                table: "PurchaseOrderItems",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
