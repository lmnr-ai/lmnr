import { subSection } from "../../class-names";
import Card from "./card";
import { CARDS } from "./cards";

const FeaturesForEveryStep = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>{"One platform for every stage of agent development."}</h2>
    {/* Two up even on the narrowest phone: a single column would stretch each
        card past the graphic band's proportions. */}
    <div className="grid grid-cols-2 lg:grid-cols-2 gap-3 w-full">
      {CARDS.map((card) => (
        <Card key={card.title} {...card} />
      ))}
    </div>
  </section>
);

export default FeaturesForEveryStep;
