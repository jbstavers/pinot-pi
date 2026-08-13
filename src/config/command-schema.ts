import { StringEnum } from "@earendil-works/pi-ai";
import { Type, type Static } from "typebox";

export const PINOT_COMMAND_SCHEMA = Type.Object({
  action: StringEnum(["setup", "status"] as const),
});

export type PinotCommand = Static<typeof PINOT_COMMAND_SCHEMA>;
