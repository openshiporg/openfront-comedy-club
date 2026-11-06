-- AlterTable
ALTER TABLE "VenueSettings" ADD COLUMN     "logoColor" TEXT NOT NULL DEFAULT '330',
ADD COLUMN     "logoIcon" TEXT NOT NULL DEFAULT '<svg fill="none" height="100%" viewBox="0 0 40 48" width="100%" xmlns="http://www.w3.org/2000/svg"><path clip-rule="evenodd" d="m20 4c11.0457 0 20 8.9543 20 20s-8.9543 20-20 20-20-8.9543-20-20 8.9543-20 20-20zm15 20c0 8.2843-6.7157 15-15 15v-30c8.2843 0 15 6.7157 15 15z" fill="#155eef" fill-rule="evenodd"/></svg>';
