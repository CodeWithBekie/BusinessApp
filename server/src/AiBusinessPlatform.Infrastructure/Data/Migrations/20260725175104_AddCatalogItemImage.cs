using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddCatalogItemImage : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ImageContentType",
                table: "CatalogItems",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "ImageData",
                table: "CatalogItems",
                type: "bytea",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "CatalogItems",
                keyColumn: "Id",
                keyValue: new Guid("00000000-0000-0000-0000-000000000003"),
                columns: new[] { "ImageContentType", "ImageData" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "CatalogItems",
                keyColumn: "Id",
                keyValue: new Guid("00000000-0000-0000-0000-000000000004"),
                columns: new[] { "ImageContentType", "ImageData" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "CatalogItems",
                keyColumn: "Id",
                keyValue: new Guid("00000000-0000-0000-0000-000000000005"),
                columns: new[] { "ImageContentType", "ImageData" },
                values: new object[] { null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ImageContentType",
                table: "CatalogItems");

            migrationBuilder.DropColumn(
                name: "ImageData",
                table: "CatalogItems");
        }
    }
}
