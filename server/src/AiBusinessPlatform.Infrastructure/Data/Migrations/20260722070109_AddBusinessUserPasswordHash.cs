using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AiBusinessPlatform.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddBusinessUserPasswordHash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BusinessUsers_BusinessId_Email",
                table: "BusinessUsers");

            migrationBuilder.AddColumn<string>(
                name: "PasswordHash",
                table: "BusinessUsers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.UpdateData(
                table: "BusinessUsers",
                keyColumn: "Id",
                keyValue: new Guid("00000000-0000-0000-0000-000000000002"),
                column: "PasswordHash",
                value: "AQAAAAIAAYagAAAAEJm2hE9zbCsWS3kVTQSYot1knZTUeXR80NsqS/ov62epokuTJwITOS89BiakmsBMeQ==");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessUsers_Email",
                table: "BusinessUsers",
                column: "Email",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BusinessUsers_Email",
                table: "BusinessUsers");

            migrationBuilder.DropColumn(
                name: "PasswordHash",
                table: "BusinessUsers");

            migrationBuilder.CreateIndex(
                name: "IX_BusinessUsers_BusinessId_Email",
                table: "BusinessUsers",
                columns: new[] { "BusinessId", "Email" },
                unique: true);
        }
    }
}
