# 第三、四章计算模型

joint_model.py是双主体五批仿真引擎；run_study.py组织基准、4组控制、15组候选、价格敏感性、12000条基准情景、6000条温和/严峻情景、滚动筛选及压力测试。

- results/：预存完整研究结果，运行后原位更新；study_results.json为汇总，*_events.csv为确定性日内台账，*_paths.npz为逐条情景结果。
- expected/study_results.json：交付基准，供本次复算比较。
- validation/：23项基础检查、9项还款检查及3条详细核对台账。
- inputs/：随机输入及观察路径，export_tables.py/根目录reproduce.py生成。
- article_outputs/：模型直接生成的第四章表格与转译对象，保留未四舍五入数值。

直接运行：python run_study.py；python verify_risk_case.py；python export_tables.py。

NPZ读取：z=numpy.load('results/短账期_plan_paths.npz')；z.files列字段；z['peak_A']/10000转换为万元。各数组第一维是同一条路径；五批日期数组第二维是批次。原始随机输入与结果同一行按path_id关联。未清偿时间用inf表示；JSON中的null保留不可得/无穷的语义，需结合字段读取。
