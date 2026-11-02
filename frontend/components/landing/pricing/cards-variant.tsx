import PricingCard from "./pricing-card";
import { CARD_FEATURES, RECOMMENDED_TIER, TIER_COLUMNS } from "./tier-data";

// 4 cards side-by-side. The recommended tier flips to the orange `isAccent`
// fill. Default layout — strongest visual differentiation for the recommended
// column, weakest at-a-glance feature comparison.
export default function CardsVariant() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full">
      {TIER_COLUMNS.map((tier) => (
        <PricingCard
          key={tier.id}
          title={tier.name}
          price={tier.price}
          priceSuffix={tier.priceSuffix}
          features={CARD_FEATURES[tier.id]}
          isAccent={tier.id === RECOMMENDED_TIER}
          ctaLabel={tier.ctaLabel}
          ctaHref={tier.ctaHref}
        />
      ))}
    </div>
  );
}
