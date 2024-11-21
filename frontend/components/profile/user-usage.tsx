


// interface UserUsageProps {
//   stats: UserStats;
// }

export default function UserUsage({}) {
  // const { data: storageStats }: { data: StorageStats } = useSWR('/api/limits/user/storage', swrFetcher);
  // const storageMiB = storageStats?.storageMib ?? 0;
  // const storageMiBLimit = stats?.storageLimit;
  // const spansThisMonth = stats.spansThisMonth;
  // const spansLimit = stats.spansLimit;
  // const eventsThisMonth = stats.eventsThisMonth;
  // const eventsLimit = stats.eventsLimit;
  // return (
  //   <div className="shadow-md rounded-lg p-4 md:w-1/2 sm:w-full flex flex-col space-y-4 border bg-secondary/40">
  //     <div className="flex flex-col space-y-1">
  //       <div className="mt-2 text-secondary-foreground text-sm">Spans</div>
  //       <div className="flex flex-row space-x-2 ">
  //         <div className="">{spansThisMonth} / {spansLimit}</div>
  //       </div>
  //       <Progress
  //         value={Math.min(spansThisMonth / spansLimit * 100, 100)}
  //         className="text-foreground h-1" />
  //     </div>
  //     <div className="flex flex-col space-y-1">
  //       <div className="mt-2 text-secondary-foreground text-sm">Events</div>
  //       <div className="flex flex-row space-x-2 ">
  //         <div className="">{eventsThisMonth} / {eventsLimit}</div>
  //       </div>
  //       <Progress
  //         value={Math.min(eventsThisMonth / eventsLimit * 100, 100)}
  //         className="text-foreground h-1" />
  //     </div>
  //     <div className="flex flex-col space-y-1">
  //       <div className="mt-2 text-secondary-foreground text-sm">Storage</div>
  //       <div className="flex flex-row space-x-2 ">
  //         <div className="">{storageMiB.toFixed(2)} MB / {storageMiBLimit} MB</div>
  //       </div>
  //       <Progress
  //         value={Math.min(storageMiB / storageMiBLimit * 100, 100)}
  //         className="text-foreground h-1" />
  //     </div>
  //     {(stats.spansOverLimit > 0) && (
  //       <div className="flex flex-col space-y-1">
  //         <div className="mt-2 text-secondary-foreground text-sm">Additional spans usage</div>
  //         <div className="flex flex-row space-x-2 ">
  //           <div className="">
  //             {stats.spansOverLimit} @ ${stats.spansOverLimitCost}
  //           </div>
  //         </div>
  //       </div>
  //     )}
  //     {(stats.eventsOverLimit > 0) && (
  //       <div className="flex flex-col space-y-2">
  //         <div className="mt-2">Additional events usage</div>
  //         <div className="flex flex-row space-x-2 ">
  //           <div className="text-sm flex-grow text-secondary-foreground">
  //             {stats.eventsOverLimit} @ ${stats.eventsOverLimitCost}
  //           </div>
  //         </div>
  //       </div>
  //     )}
  //   </div>
  // )
}
