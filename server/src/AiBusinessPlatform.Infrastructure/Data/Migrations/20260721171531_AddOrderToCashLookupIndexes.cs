using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderToCashLookupIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_Payments_OrderId_Status",
                table: "Payments",
                columns: new[] { "OrderId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CustomerId_Status",
                table: "Orders",
                columns: new[] { "CustomerId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Payments_OrderId_Status",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Orders_CustomerId_Status",
                table: "Orders");
        }
    }
}
