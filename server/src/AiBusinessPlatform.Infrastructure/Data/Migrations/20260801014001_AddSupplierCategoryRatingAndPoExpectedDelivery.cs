using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplierCategoryRatingAndPoExpectedDelivery : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Category",
                table: "Suppliers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Rating",
                table: "Suppliers",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ExpectedDeliveryDate",
                table: "PurchaseOrders",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Category",
                table: "Suppliers");

            migrationBuilder.DropColumn(
                name: "Rating",
                table: "Suppliers");

            migrationBuilder.DropColumn(
                name: "ExpectedDeliveryDate",
                table: "PurchaseOrders");
        }
    }
}
