import { subSection } from "../../class-names";
import Card from "./card";
import { CARDS } from "./cards";

const FeaturesForEveryStep = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>{"Comprehensive platform for agent development."}</h2>
    {/* One up on phones: at half a phone's width the graphic band has nothing
        legible left in it. */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
      {CARDS.map((card) => (
        <Card key={card.title} {...card} />
      ))}
    </div>
  </section>
);

export default FeaturesForEveryStep;
