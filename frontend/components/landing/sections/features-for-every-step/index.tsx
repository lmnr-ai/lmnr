"use client";

import { useState } from "react";

import { subSection } from "../../class-names";
import Card from "./card";
import { CARDS } from "./cards";
import { GRAPHICS, type Variant } from "./graphics";
import VariantSwitcher from "./variant-switcher";

const FeaturesForEveryStep = () => {
  const [variant, setVariant] = useState<Variant>("a");

  return (
    <section className="flex flex-col items-start gap-[52px] w-full">
      <div className="flex w-full items-center justify-between gap-4">
        <h2 className={subSection}>{"One platform for every stage of agent development."}</h2>
        <VariantSwitcher value={variant} onChange={setVariant} />
      </div>
      {/* Two up even on the narrowest phone: a single column would stretch each
          card past the graphic band's proportions. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 w-full">
        {CARDS.map((card) => (
          <Card key={card.id} {...card} Graphic={GRAPHICS[card.id][variant]} />
        ))}
      </div>
    </section>
  );
};

export default FeaturesForEveryStep;
