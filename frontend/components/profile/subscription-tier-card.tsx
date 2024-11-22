


export default function SubscriptionTierCard() {
  return (
    <div className="shadow-md rounded-lg p-4 space-y-2 md:w-1/2 sm:w-full flex flex-col border bg-secondary/40">
      <div className="text-secondary-foreground">Subscription</div>
      {/* <Label className="text-lg">{stats.planName} tier</Label> */}
      {/* <Label className="text-secondary-foreground">Limits reset on {formatTimestamp(stats.resetTime)} </Label> */}
      {/* {stats.planName.toLowerCase().trim() === 'free' && (
        <div className="flex space-x-4">
          <Link href="/checkout?lookupKey=pro_monthly_2024_09">
            <Button variant="default" className="">Upgrade to Pro</Button>
          </Link>
        </div>
      )}
      {stats.planName.toLowerCase().trim() === 'pro' && (
        <div className="mt-4 space-x-4">
          <Link href="/checkout/portal">
            <Button variant="secondary" className="">Manage billing</Button>
          </Link>
        </div>
      )} */}
    </div>
  );
}
