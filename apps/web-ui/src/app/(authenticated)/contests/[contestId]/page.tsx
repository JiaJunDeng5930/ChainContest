import ContestDetail from "../../../../features/contests/components/ContestDetail";
import ContestDetailPageHeader from "../../../../features/contests/components/ContestDetailPageHeader";

type ContestDetailPageProps = {
  params: {
    contestId: string;
  };
};

export default function ContestDetailPage({ params }: ContestDetailPageProps) {
  const { contestId } = params;

  return (
    <div className="space-y-6">
      <ContestDetailPageHeader />
      <ContestDetail contestId={contestId} />
    </div>
  );
}
