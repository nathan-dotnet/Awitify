
import TrackPlayer, { PlayerCommand } from "@rntp/player";
import { registerRootComponent } from "expo";

TrackPlayer.registerPlaybackSession(() => {
  TrackPlayer.setupPlayer({
    progressSync: {
      intervalSeconds: 1,
    },
  });

  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Previous,
      PlayerCommand.Next,
    ],
  });
});

registerRootComponent(require("./App").default);
